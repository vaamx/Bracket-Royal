import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResults, runScoring } from "@/lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GLOBAL = "00000000-0000-0000-0000-000000000001";
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("results → scoring → standings (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;

  beforeAll(async () => {
    const email = `score-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    if (error) throw error;
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await client.auth.signInWithPassword({ email, password: "Password123!" });
    user = { id: data.user!.id, client };

    // Reset the seeded match so the test is deterministic regardless of prior sims.
    await admin.from("matches").update({ status: "scheduled", home_score: null, away_score: null, winner_team_id: null }).eq("id", "GA-MEX-BEL");
    // User predicts MEX 2-1 BEL (exact match for the result we'll apply).
    // Use admin client to bypass lock_at RLS (lock_at is in the past for seeded matches;
    // we're testing the scoring pipeline, not prediction-write access control).
    await admin.from("predictions").upsert(
      { user_id: user.id, match_id: "GA-MEX-BEL", predicted_home: 2, predicted_away: 1 },
      { onConflict: "user_id,match_id" }
    );
  });

  it("grades an exact prediction and writes it to the user's global standings", async () => {
    await applyResults(admin, [{ matchId: "GA-MEX-BEL", homeScore: 2, awayScore: 1 }]);
    await runScoring(admin);

    const { data } = await user.client
      .from("league_standings")
      .select("points, exact_count")
      .eq("league_id", GLOBAL)
      .eq("user_id", user.id)
      .single();

    expect(data?.points).toBeGreaterThanOrEqual(5); // exact scoreline = 5
    expect(data?.exact_count).toBeGreaterThanOrEqual(1);
  });
});
