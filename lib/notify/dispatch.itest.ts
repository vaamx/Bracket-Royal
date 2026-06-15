import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { selectDueReminders } from "@/lib/notify/select";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("notification selection against live data (integration)", () => {
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;
  let userId: string;
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  beforeAll(async () => {
    const { data } = await admin.auth.admin.createUser({ email: `notif-${stamp}@example.com`, password: "Password123!", email_confirm: true });
    userId = data.user!.id;
    await admin.from("notification_prefs").upsert({ user_id: userId, push_enabled: false, email_enabled: true, email: `notif-${stamp}@example.com` });
    // Make a seeded R32 match lock in 30 min, teams resolved, unpredicted by this user.
    await admin.from("matches").update({ lock_at: future, status: "scheduled" }).eq("id", "GA-MEX-BEL");
  });

  afterAll(async () => {
    await admin.from("notification_prefs").delete().eq("user_id", userId);
    await admin.from("notifications_sent").delete().eq("user_id", userId);
    // Restore the match we mutated so later integration files see a clean slate.
    await admin.from("matches").update({ status: "scheduled", lock_at: null }).eq("id", "GA-MEX-BEL");
  });

  it("selects a due reminder for an opted-in user who hasn't predicted, and dedups once sent", async () => {
    const dueMatches = [{ id: "GA-MEX-BEL", lockAtMs: new Date(future).getTime() }];
    const users = [{ userId, push: false, email: true }];

    const first = selectDueReminders({ dueMatches, users, predictedPairs: new Set(), sentPairs: new Set() });
    expect(first).toEqual([{ userId, matchId: "GA-MEX-BEL", channels: ["email"] }]);

    // After logging the send, it must not re-select.
    await admin.from("notifications_sent").upsert({ user_id: userId, kind: "lock", ref: "GA-MEX-BEL", channel: "email" });
    const { data: sent } = await admin.from("notifications_sent").select("user_id, ref, channel").eq("kind", "lock").eq("user_id", userId);
    const sentPairs = new Set((sent ?? []).map((s) => `${s.user_id}:${s.ref}:${s.channel}`));
    const second = selectDueReminders({ dueMatches, users, predictedPairs: new Set(), sentPairs });
    expect(second).toHaveLength(0);
  });
});
