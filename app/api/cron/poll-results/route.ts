import { NextResponse } from "next/server";
import { footballDataProvider } from "@/lib/feed/footballData";
import { applyResults, runScoring } from "@/lib/scoring/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Polls the results provider, applies new finals, and rescoring. Guarded by
 * CRON_SECRET (Vercel Cron sends it as a Bearer token). The TLA→match-id resolver
 * returns null until real fixtures replace the dev seed, so this safely no-ops
 * in dev while the simulate script drives scoring locally.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const provider = footballDataProvider(() => null);
    const results = await provider.fetchFinishedResults();
    const applied = await applyResults(admin, results);
    const scored = applied > 0 ? await runScoring(admin) : { leagues: 0, rows: 0 };
    return NextResponse.json({ provider: provider.name, applied, ...scored });
  } catch (e) {
    const message = e instanceof Error ? e.message : "poll failed";
    console.error("poll-results failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
