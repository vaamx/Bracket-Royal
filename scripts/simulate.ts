import { config } from "dotenv";
config({ path: ".env.local" });

import ws from "ws";
// Node 20 lacks native WebSocket; polyfill it before @supabase/supabase-js initialises.
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error -- ws constructor is compatible enough for Supabase's RealtimeClient.
  globalThis.WebSocket = ws;
}
import { createClient } from "@supabase/supabase-js";
import { applyResults, runScoring } from "../lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env in .env.local");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

function randomScore(): number {
  const r = Math.random();
  return r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
}

async function main() {
  const limit = Number(process.argv[2] ?? "0"); // 0 = all group matches
  const { data: matches, error } = await admin
    .from("matches")
    .select("id")
    .eq("stage", "group")
    .neq("status", "final")
    .order("kickoff_at", { ascending: true });
  if (error) throw error;

  const toPlay = (matches ?? []).slice(0, limit > 0 ? limit : undefined);
  const results = toPlay.map((m) => ({ matchId: m.id, homeScore: randomScore(), awayScore: randomScore() }));

  const applied = await applyResults(admin, results);
  console.log(`Applied ${applied} results`);
  const { resolveAndAdvance } = await import("../lib/scoring/run");
  const r = await resolveAndAdvance(admin);
  console.log(`Bracket: R32 resolved=${r.r32Resolved}, advanced ${r.advanced} slots`);
  const { leagues, rows } = await runScoring(admin);
  console.log(`Scored ${rows} standings rows across ${leagues} leagues`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
