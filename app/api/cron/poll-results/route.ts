import { NextResponse } from "next/server";
import { runScoring, resolveAndAdvance, applyResults } from "@/lib/scoring/run";
import { refreshWorldCupResults, fetchKnockoutFinals, knockoutResultsByTeamPair } from "@/lib/feed/ingestWorldCup";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Refreshes real WC2026 results from football-data.org (non-destructive): group
 * scores, then — once groups finish — the bracket advances and real knockout
 * results are matched into our ties by team pairing. Then re-scores. CRON_SECRET-
 * guarded; no-ops (updated:0) without FOOTBALL_DATA_API_KEY.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    if (!process.env.FOOTBALL_DATA_API_KEY) {
      return NextResponse.json({ updated: 0, note: "no FOOTBALL_DATA_API_KEY" });
    }
    const admin = createAdminClient();
    const { updated, finished } = await refreshWorldCupResults(admin);
    await resolveAndAdvance(admin);

    // Cascade real knockout results round by round (each round's teams resolve from
    // the prior round before its results can be matched in by team pairing).
    const fdKo = await fetchKnockoutFinals();
    let koApplied = 0;
    for (let round = 0; round < 6; round++) {
      const { data: ourKo } = await admin
        .from("matches").select("id, home_team_id, away_team_id, status").neq("stage", "group");
      const results = knockoutResultsByTeamPair(ourKo ?? [], fdKo);
      if (results.length === 0) break;
      koApplied += await applyResults(admin, results);
      await resolveAndAdvance(admin);
    }

    const scored = await runScoring(admin);
    return NextResponse.json({ updated, finished, koApplied, ...scored });
  } catch (e) {
    const message = e instanceof Error ? e.message : "poll failed";
    console.error("poll-results failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
