import { NextResponse } from "next/server";
import { runScoring, resolveAndAdvance } from "@/lib/scoring/run";
import { refreshWorldCupResults } from "@/lib/feed/ingestWorldCup";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Refreshes real WC2026 group results from football-data.org (non-destructive),
 * advances the bracket once groups finish, and re-scores. Guarded by CRON_SECRET.
 * No-ops cleanly (returns updated:0) when FOOTBALL_DATA_API_KEY is absent.
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
    const scored = await runScoring(admin);
    return NextResponse.json({ updated, finished, ...scored });
  } catch (e) {
    const message = e instanceof Error ? e.message : "poll failed";
    console.error("poll-results failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
