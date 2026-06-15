import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { applyResults, runScoring, resolveAndAdvance } from "@/lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("group → R32 resolution (integration)", () => {
  beforeAll(async () => {
    // Finalize every group match with a deterministic score so standings resolve.
    const { data: groupMatches } = await admin
      .from("matches").select("id, home_team_id, away_team_id").eq("stage", "group");
    const results = (groupMatches ?? []).map((m, i) => ({ matchId: m.id, homeScore: (i % 3) + 1, awayScore: i % 2 }));
    await applyResults(admin, results);
    await resolveAndAdvance(admin);
  });

  it("fills all 16 R32 ties with real teams once the groups are decided", async () => {
    const { data: r32 } = await admin
      .from("matches").select("id, home_team_id, away_team_id").eq("stage", "r32");
    expect(r32).toHaveLength(16);
    for (const m of r32 ?? []) {
      expect(m.home_team_id).toBeTruthy();
      expect(m.away_team_id).toBeTruthy();
    }
    // 32 distinct qualifiers placed.
    const ids = (r32 ?? []).flatMap((m) => [m.home_team_id, m.away_team_id]);
    expect(new Set(ids).size).toBe(32);
  });
});
