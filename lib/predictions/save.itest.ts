import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const password = "Password123!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user!.id, client };
}

describe("prediction writes respect the lock (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;
  const openId = `ITEST-OPEN-${stamp}`;
  const lockedId = `ITEST-LOCKED-${stamp}`;

  beforeAll(async () => {
    user = await makeUser(`pred-${stamp}@example.com`);
    // Reuse seeded Group-A teams (present from supabase/seed.sql).
    const future = "2999-01-01T00:00:00Z";
    const past = "2000-01-01T00:00:00Z";
    const { error } = await admin.from("matches").insert([
      { id: openId, stage: "group", group_label: "A", home_team_id: "MEX", away_team_id: "BEL", kickoff_at: future, lock_at: future, status: "scheduled" },
      { id: lockedId, stage: "group", group_label: "A", home_team_id: "SCO", away_team_id: "JOR", kickoff_at: past, lock_at: past, status: "scheduled" },
    ]);
    if (error) throw error;
  });

  it("allows a prediction on an unlocked match", async () => {
    const { error } = await user.client.from("predictions").upsert(
      { user_id: user.id, match_id: openId, predicted_home: 2, predicted_away: 1 },
      { onConflict: "user_id,match_id" }
    );
    expect(error).toBeNull();
  });

  it("rejects a prediction on a locked match", async () => {
    const { error } = await user.client.from("predictions").insert(
      { user_id: user.id, match_id: lockedId, predicted_home: 1, predicted_away: 0 }
    );
    expect(error).not.toBeNull(); // RLS with_check: now() < lock_at fails
  });
});
