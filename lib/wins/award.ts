import type { SupabaseClient } from "@supabase/supabase-js";
import { detectDailyWins, type DailyWin } from "@/lib/wins/detect";
import { dailyWinsEmail, type WinItem } from "@/lib/notify/templates";
import { sendEmail } from "@/lib/notify/email";

/**
 * Detect the day's medals from real results and upsert them (idempotent on
 * user_id+win_key). Service-role client. Returns how many medal rows were
 * newly inserted this run.
 */
export async function awardDailyWins(admin: SupabaseClient): Promise<{ awarded: number }> {
  const [matchesRes, predsRes, playersRes, scorerRes] = await Promise.all([
    admin.from("matches").select("id, home_team_id, away_team_id, home_score, away_score, status"),
    admin.from("predictions").select("user_id, match_id, predicted_home, predicted_away"),
    admin.from("players").select("id, name, goals"),
    admin.from("scorer_predictions").select("user_id, player_id, predicted_goals"),
  ]);
  for (const r of [matchesRes, predsRes, playersRes, scorerRes]) if (r.error) throw r.error;

  const allMatches = matchesRes.data ?? [];
  // teams.id is already the 3-letter code (e.g. 'BRA'), so home/away_team_id are display-ready.
  const finalMatches = allMatches
    .filter((m) => m.status === "final" && m.home_score !== null && m.away_score !== null && m.home_team_id && m.away_team_id)
    .map((m) => ({
      id: m.id,
      homeCode: m.home_team_id as string,
      awayCode: m.away_team_id as string,
      homeScore: m.home_score as number,
      awayScore: m.away_score as number,
    }));
  const tournamentComplete = allMatches.length > 0 && allMatches.every((m) => m.status === "final");

  const predictionsByUser = new Map<string, { matchId: string; predHome: number | null; predAway: number | null }[]>();
  for (const p of predsRes.data ?? []) {
    const list = predictionsByUser.get(p.user_id) ?? [];
    list.push({ matchId: p.match_id, predHome: p.predicted_home, predAway: p.predicted_away });
    predictionsByUser.set(p.user_id, list);
  }
  const scorerByUser = new Map<string, { playerId: string; predictedGoals: number | null }[]>();
  for (const s of scorerRes.data ?? []) {
    const list = scorerByUser.get(s.user_id) ?? [];
    list.push({ playerId: s.player_id, predictedGoals: s.predicted_goals });
    scorerByUser.set(s.user_id, list);
  }
  const playerGoals: Record<string, number> = {};
  const playerName: Record<string, string> = {};
  for (const p of playersRes.data ?? []) { playerGoals[p.id] = p.goals; playerName[p.id] = p.name; }

  const winsByUser = detectDailyWins({ finalMatches, predictionsByUser, scorerByUser, playerGoals, playerName, tournamentComplete });

  const rows: { user_id: string; win_key: string; kind: string; detail: string }[] = [];
  for (const [userId, wins] of winsByUser) {
    for (const w of wins) rows.push({ user_id: userId, win_key: w.winKey, kind: w.kind, detail: w.detail });
  }
  if (rows.length === 0) return { awarded: 0 };

  const { data: inserted, error } = await admin
    .from("daily_wins")
    .upsert(rows, { onConflict: "user_id,win_key", ignoreDuplicates: true })
    .select("user_id, win_key");
  if (error) throw error;
  return { awarded: inserted?.length ?? 0 };
}

/**
 * Send one beautiful digest per user for their un-emailed medals, then mark
 * those medals as emailed. Only users with email reminders on + an address.
 */
export async function sendDailyWinDigests(admin: SupabaseClient): Promise<{ sent: number }> {
  const { data: pending, error } = await admin
    .from("daily_wins").select("user_id, win_key, kind, detail").eq("emailed", false);
  if (error) throw error;
  if (!pending || pending.length === 0) return { sent: 0 };

  const userIds = [...new Set(pending.map((w) => w.user_id))];
  const [{ data: prefs }, { data: profiles }] = await Promise.all([
    admin.from("notification_prefs").select("user_id, email_enabled, email, locale").in("user_id", userIds),
    admin.from("profiles").select("id, display_name").in("id", userIds),
  ]);
  const prefByUser = new Map((prefs ?? []).map((p) => [p.user_id, p]));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));

  const byUser = new Map<string, typeof pending>();
  for (const w of pending) { const l = byUser.get(w.user_id) ?? []; l.push(w); byUser.set(w.user_id, l); }

  let sent = 0;
  for (const [userId, wins] of byUser) {
    const pref = prefByUser.get(userId);
    if (!pref || !pref.email_enabled || !pref.email) continue;
    const locale = pref.locale === "es" ? "es" : "en";
    const items: WinItem[] = wins.map((w) => ({ kind: (w.kind === "goals" ? "goals" : "exact") as DailyWin["kind"], detail: w.detail }));
    const { subject, html } = dailyWinsEmail(nameById.get(userId) ?? "champ", items, locale);
    const ok = await sendEmail({ to: pref.email, subject, html });
    if (!ok) continue;
    const { error: upErr } = await admin
      .from("daily_wins").update({ emailed: true })
      .eq("user_id", userId).in("win_key", wins.map((w) => w.win_key));
    if (!upErr) sent++;
  }
  return { sent };
}
