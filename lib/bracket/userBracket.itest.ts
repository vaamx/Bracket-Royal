import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResults, resolveAndAdvance } from "@/lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("knockout pick saves under RLS (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  let r32Match: { id: string; home_team_id: string };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;

  beforeAll(async () => {
    // Ensure groups are decided and R32 resolved.
    const { data: groupMatches } = await admin.from("matches").select("id").eq("stage", "group");
    await applyResults(admin, (groupMatches ?? []).map((m, i) => ({ matchId: m.id, homeScore: (i % 3) + 1, awayScore: i % 2 })));
    await resolveAndAdvance(admin);

    const { data: r32 } = await admin
      .from("matches").select("id, home_team_id, lock_at, status").eq("stage", "r32").limit(1).single();
    r32Match = { id: r32!.id, home_team_id: r32!.home_team_id as string };
    // Make sure it's unlocked for the test.
    await admin.from("matches").update({ lock_at: "2999-01-01T00:00:00Z", status: "scheduled" }).eq("id", r32Match.id);

    const email = `bracket-${stamp}@example.com`;
    const { data } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await client.auth.signInWithPassword({ email, password: "Password123!" });
    user = { id: data.user!.id, client };
  });

  it("saves a winner pick for a resolved, unlocked R32 tie", async () => {
    const { error } = await user.client.from("predictions").upsert(
      { user_id: user.id, match_id: r32Match.id, predicted_winner_team_id: r32Match.home_team_id },
      { onConflict: "user_id,match_id" }
    );
    expect(error).toBeNull();

    const { data } = await user.client
      .from("predictions").select("predicted_winner_team_id").eq("user_id", user.id).eq("match_id", r32Match.id).single();
    expect(data?.predicted_winner_team_id).toBe(r32Match.home_team_id);
  });
});
