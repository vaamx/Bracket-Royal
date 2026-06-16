import { config } from "dotenv";
config({ path: ".env.local" });

import ws from "ws";
// Node 20 lacks native WebSocket; polyfill it before @supabase/supabase-js initialises.
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error -- ws constructor is compatible enough for Supabase's RealtimeClient.
  globalThis.WebSocket = ws;
}
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResults, runScoring, resolveAndAdvance } from "../lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env in .env.local");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function randomScore(): number {
  const r = Math.random();
  return r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
}

/** Finalize scheduled group matches with random scores (keeps already-played results). */
async function playGroups(admin: SupabaseClient, limit: number): Promise<number> {
  const { data: matches, error } = await admin
    .from("matches").select("id").eq("stage", "group").neq("status", "final").order("kickoff_at", { ascending: true });
  if (error) throw error;
  const toPlay = (matches ?? []).slice(0, limit > 0 ? limit : undefined);
  const results = toPlay.map((m) => ({ matchId: m.id, homeScore: randomScore(), awayScore: randomScore() }));
  return applyResults(admin, results);
}

const KO_ORDER = ["r32", "r16", "qf", "sf", "final", "third"] as const;

/** Play every knockout round to the final — resolving teams, deciding ties, advancing winners. */
async function playKnockout(admin: SupabaseClient): Promise<string | null> {
  for (const stage of KO_ORDER) {
    await resolveAndAdvance(admin); // fill this round's teams from the previous round
    const { data: matches } = await admin
      .from("matches").select("id, home_team_id, away_team_id, status").eq("stage", stage);
    const playable = (matches ?? []).filter((m) => m.home_team_id && m.away_team_id && m.status !== "final");
    if (playable.length === 0) continue;
    const results = playable.map((m) => {
      let h = randomScore();
      let a = randomScore();
      if (h === a) h += 1; // knockouts can't draw
      return { matchId: m.id, homeScore: h, awayScore: a };
    });
    await applyResults(admin, results);
    console.log(`  ${stage.toUpperCase()}: played ${results.length} match(es)`);
  }
  await resolveAndAdvance(admin);
  const { data: fin } = await admin.from("matches").select("winner_team_id").eq("id", "F-1").maybeSingle();
  return fin?.winner_team_id ?? null;
}

async function main() {
  const mode = process.argv[2];
  const full = mode === "final" || mode === "ko" || mode === "full";

  if (full) {
    const applied = await playGroups(admin, 0); // finalize ALL groups
    console.log(`Finalized group stage (${applied} matches played this run)`);
    const champion = await playKnockout(admin);
    const { rows, leagues } = await runScoring(admin);
    console.log(`Scored ${rows} standings rows across ${leagues} leagues`);
    if (champion) {
      const { data: t } = await admin.from("teams").select("name").eq("id", champion).maybeSingle();
      console.log(`\n🏆 CHAMPION: ${t?.name ?? champion}`);
    }
    return;
  }

  // Default: play group matches only (optionally limited), unlocking the bracket once groups finish.
  const limit = Number(mode ?? "0");
  const applied = await playGroups(admin, limit);
  console.log(`Applied ${applied} results`);
  const r = await resolveAndAdvance(admin);
  console.log(`Bracket: R32 resolved=${r.r32Resolved}, advanced ${r.advanced} slots`);
  const { leagues, rows } = await runScoring(admin);
  console.log(`Scored ${rows} standings rows across ${leagues} leagues`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
