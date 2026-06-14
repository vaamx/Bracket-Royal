import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { FIXTURE_GROUPS, FIXTURE_TEAMS } from "../lib/data/wc2026-fixtures";
import { buildGroupMatches } from "../lib/data/groupSchedule";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  realtime: { transport: ws as any },
});

// Tournament opens 2026-06-11; each matchday is 4 days apart (fixture timing only).
const GROUP_STAGE_START = Date.UTC(2026, 5, 11, 18, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function kickoffFor(groupIndex: number, matchday: number): string {
  // Stagger groups by a few hours so the dev data has a spread of lock times.
  const ms = GROUP_STAGE_START + (matchday - 1) * 4 * DAY + (groupIndex % 4) * 3 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

async function main() {
  // 1. Teams
  const teamRows = FIXTURE_TEAMS.map((t) => ({
    id: t.id, name: t.name, flag: t.flag, group_label: t.group_label, fifa_rank: t.fifaRank,
  }));
  const { error: teamErr } = await admin.from("teams").upsert(teamRows, { onConflict: "id" });
  if (teamErr) throw teamErr;
  console.log(`Upserted ${teamRows.length} teams`);

  // 2. Matches
  const matchRows = FIXTURE_GROUPS.flatMap((g, gi) =>
    buildGroupMatches(g.label, g.teams.map((t) => t.id)).map((m) => {
      const kickoff = kickoffFor(gi, m.matchday);
      return {
        id: m.id, stage: m.stage, group_label: m.group_label,
        home_team_id: m.home_team_id, away_team_id: m.away_team_id,
        kickoff_at: kickoff, lock_at: kickoff, status: "scheduled" as const,
      };
    })
  );
  const { error: matchErr } = await admin.from("matches").upsert(matchRows, { onConflict: "id" });
  if (matchErr) throw matchErr;
  console.log(`Upserted ${matchRows.length} matches`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
