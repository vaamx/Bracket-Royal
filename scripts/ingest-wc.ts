import { config } from "dotenv";
config({ path: ".env.local" });

import ws from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error -- ws is compatible enough for supabase-js on Node 20.
  globalThis.WebSocket = ws;
}

import { createClient } from "@supabase/supabase-js";
import { ingestWorldCup } from "../lib/feed/ingestWorldCup";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env in .env.local");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const r = await ingestWorldCup(admin);
  console.log(`Ingested real WC2026: ${r.teams} teams, ${r.groupMatches} group matches (${r.finished} already played)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
