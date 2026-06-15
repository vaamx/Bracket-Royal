import type { SupabaseClient } from "@supabase/supabase-js";
import { selectDueReminders, type NotifyUser } from "@/lib/notify/select";
import { lockReminderPush, lockReminderEmail } from "@/lib/notify/templates";
import { sendPush } from "@/lib/notify/push";
import { sendEmail } from "@/lib/notify/email";

const WINDOW_MS = 60 * 60 * 1000; // remind for matches locking within the next hour

/**
 * Send due lock-reminders across enabled channels and log each send for dedup.
 * Takes an injected service-role client (Node-safe). `nowMs` defaults to now.
 */
export async function dispatchReminders(admin: SupabaseClient, nowMs: number = Date.now()): Promise<{ sent: number }> {
  const horizon = new Date(nowMs + WINDOW_MS).toISOString();
  const now = new Date(nowMs).toISOString();

  const [matchesRes, teamsRes, prefsRes, predsRes, sentRes] = await Promise.all([
    admin.from("matches").select("id, home_team_id, away_team_id, group_label, lock_at, status")
      .eq("status", "scheduled").not("lock_at", "is", null).gte("lock_at", now).lte("lock_at", horizon),
    admin.from("teams").select("id, name"),
    admin.from("notification_prefs").select("user_id, push_enabled, email_enabled, email"),
    admin.from("predictions").select("user_id, match_id"),
    admin.from("notifications_sent").select("user_id, ref, channel").eq("kind", "lock"),
  ]);

  const dueMatches = (matchesRes.data ?? [])
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => ({ id: m.id, lockAtMs: new Date(m.lock_at as string).getTime() }));
  if (dueMatches.length === 0) return { sent: 0 };

  const nameById = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]));
  const matchInfo = new Map(
    (matchesRes.data ?? []).map((m) => [m.id, {
      home: nameById.get(m.home_team_id as string) ?? (m.home_team_id as string),
      away: nameById.get(m.away_team_id as string) ?? (m.away_team_id as string),
      group: m.group_label,
    }])
  );

  const users: NotifyUser[] = (prefsRes.data ?? [])
    .filter((p) => p.push_enabled || p.email_enabled)
    .map((p) => ({ userId: p.user_id, push: p.push_enabled, email: p.email_enabled && !!p.email }));
  const emailByUser = new Map((prefsRes.data ?? []).map((p) => [p.user_id, p.email]));

  const predictedPairs = new Set((predsRes.data ?? []).map((p) => `${p.user_id}:${p.match_id}`));
  const sentPairs = new Set((sentRes.data ?? []).map((s) => `${s.user_id}:${s.ref}:${s.channel}`));

  const reminders = selectDueReminders({ dueMatches, users, predictedPairs, sentPairs });

  let sent = 0;
  for (const r of reminders) {
    const info = matchInfo.get(r.matchId);
    if (!info) continue;
    for (const channel of r.channels) {
      let ok = false;
      if (channel === "push") {
        const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", r.userId);
        for (const s of subs ?? []) ok = (await sendPush(s, lockReminderPush(info))) || ok;
      } else {
        const to = emailByUser.get(r.userId);
        if (to) { const e = lockReminderEmail(info); ok = await sendEmail({ to, subject: e.subject, html: e.html }); }
      }
      if (ok) {
        await admin.from("notifications_sent").upsert(
          { user_id: r.userId, kind: "lock", ref: r.matchId, channel },
          { onConflict: "user_id,kind,ref,channel", ignoreDuplicates: true }
        );
        sent++;
      }
    }
  }
  return { sent };
}
