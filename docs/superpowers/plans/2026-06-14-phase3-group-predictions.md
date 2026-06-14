# Phase 1 — Plan 3: Group Predictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guided, group-by-group screen where a signed-in user predicts the scoreline of every group match, watches their predicted table re-sort live, and has each match lock at kickoff — all saved to Supabase under the RLS already in place.

**Architecture:** A `predict` route renders one group at a time (A→L) with a progress indicator. Each group card shows a live predicted standings table (computed in the browser with the existing pure `computeGroupStandings`) above six score-input rows. Score edits autosave (debounced) to `public.predictions` via the browser Supabase client; RLS enforces own-row + before-`lock_at`. A reusable TS fixtures module + a tested round-robin generator + a seed script give the DB all 12 groups for development (real data arrives from the feed in Plan 4). Framer Motion animates the table re-sort and celebration micro-interactions.

**Tech Stack:** Next.js 16 App Router (server components for data load, client components for inputs), React 19, Supabase JS (browser client + RLS), the existing `lib/math` module, Framer Motion, Vitest (unit + one integration test).

---

## Decisions for this plan

- **Dev data:** a TS fixtures module (`lib/data/wc2026-fixtures.ts`) is the single source of truth for the 12 groups / 48 teams; a tested pure generator builds the 72 round-robin matches; a `npm run seed` script upserts them. Group A is ordered `[MEX, BEL, SCO, JOR]` so the generator reproduces the EXACT match ids already in `supabase/seed.sql` (`GA-MEX-BEL`, …) — keeping the existing Plan-2 integration test valid. `supabase/seed.sql` is left unchanged (Group-A baseline for `db reset`); `npm run seed` adds the rest idempotently. Real teams/schedule replace this in Plan 4.
- **Saving predictions:** client-side debounced upsert via the browser client (responsive, optimistic), protected by the existing RLS (own-row, before lock). No new server action needed for the happy path.
- **Live table:** reuse `computeGroupStandings` (pure, already tested) on the user's predicted scorelines; pass `fifaRank` from the teams for tiebreaks.
- **Locking:** a match is locked when `now() >= lock_at` OR `status = 'final'`. Locked rows render read-only; if a real result exists it's shown. (Results populate in Plan 4; UI handles their absence gracefully.)
- **Onboarding seam (from Plan 2 review):** route first-time users (no customized display name yet) is out of scope here; the `predict` flow is reachable from `/leagues`. Leave `/onboarding` as-is.

---

## File Structure

```
lib/data/wc2026-fixtures.ts                    # 12 groups, 48 teams (codes/names/flags/ranks)
lib/data/groupSchedule.ts  + .test.ts          # pure round-robin generator (TDD)
scripts/seed.ts                                # tsx: upsert teams + generated matches via admin client
lib/predictions/types.ts                       # view-model types for the predict screen
lib/predictions/toStandings.ts + .test.ts      # map a group's predictions -> PlayedMatch[] for the math module (TDD)
lib/predictions/queries.ts                     # server-side: load groups + matches + the user's predictions
lib/predictions/save.itest.ts                  # integration: RLS lock enforcement on prediction writes
components/predict/ScoreInput.tsx              # single numeric score box
components/predict/PredictedTable.tsx          # live, animated standings table
components/predict/MatchRow.tsx                # one match: teams + two ScoreInputs (or locked result)
components/predict/GroupPredictor.tsx          # client: one group — table + 6 match rows + autosave
components/predict/GroupStepper.tsx            # client: A→L navigation + progress
app/(app)/predict/page.tsx                     # server: load data, gate auth, render the stepper
app/(app)/predict/predict-client.tsx           # client: holds active-group state, renders GroupPredictor
package.json                                   # + framer-motion, + tsx (dev), + "seed" script
```

---

## Task 1: World Cup fixtures module

**Files:**
- Create: `lib/data/wc2026-fixtures.ts`

- [ ] **Step 1: Write `lib/data/wc2026-fixtures.ts`**

```typescript
/**
 * Dev fixture data for the 12 groups (48 teams). NOT the official draw — real
 * teams/schedule are ingested from the results feed in Plan 4. Group A is ordered
 * [MEX, BEL, SCO, JOR] so the round-robin generator reproduces the match ids
 * already in supabase/seed.sql, keeping the Plan-2 integration test valid.
 */
export interface FixtureTeam {
  id: string; // 3-letter code
  name: string;
  flag: string;
  fifaRank: number;
}

export interface FixtureGroup {
  label: string; // 'A'..'L'
  teams: FixtureTeam[]; // exactly 4, in seeding order
}

export const FIXTURE_GROUPS: FixtureGroup[] = [
  { label: "A", teams: [
    { id: "MEX", name: "Mexico", flag: "🇲🇽", fifaRank: 15 },
    { id: "BEL", name: "Belgium", flag: "🇧🇪", fifaRank: 6 },
    { id: "SCO", name: "Scotland", flag: "🏴", fifaRank: 39 },
    { id: "JOR", name: "Jordan", flag: "🇯🇴", fifaRank: 64 },
  ]},
  { label: "B", teams: [
    { id: "CAN", name: "Canada", flag: "🇨🇦", fifaRank: 43 },
    { id: "MAR", name: "Morocco", flag: "🇲🇦", fifaRank: 12 },
    { id: "UZB", name: "Uzbekistan", flag: "🇺🇿", fifaRank: 57 },
    { id: "CRC", name: "Costa Rica", flag: "🇨🇷", fifaRank: 54 },
  ]},
  { label: "C", teams: [
    { id: "USA", name: "United States", flag: "🇺🇸", fifaRank: 16 },
    { id: "NED", name: "Netherlands", flag: "🇳🇱", fifaRank: 7 },
    { id: "NGA", name: "Nigeria", flag: "🇳🇬", fifaRank: 40 },
    { id: "HAI", name: "Haiti", flag: "🇭🇹", fifaRank: 86 },
  ]},
  { label: "D", teams: [
    { id: "ARG", name: "Argentina", flag: "🇦🇷", fifaRank: 1 },
    { id: "CRO", name: "Croatia", flag: "🇭🇷", fifaRank: 10 },
    { id: "ECU", name: "Ecuador", flag: "🇪🇨", fifaRank: 23 },
    { id: "CPV", name: "Cape Verde", flag: "🇨🇻", fifaRank: 70 },
  ]},
  { label: "E", teams: [
    { id: "FRA", name: "France", flag: "🇫🇷", fifaRank: 2 },
    { id: "JPN", name: "Japan", flag: "🇯🇵", fifaRank: 18 },
    { id: "SEN", name: "Senegal", flag: "🇸🇳", fifaRank: 17 },
    { id: "NZL", name: "New Zealand", flag: "🇳🇿", fifaRank: 89 },
  ]},
  { label: "F", teams: [
    { id: "ESP", name: "Spain", flag: "🇪🇸", fifaRank: 3 },
    { id: "DEN", name: "Denmark", flag: "🇩🇰", fifaRank: 21 },
    { id: "TUN", name: "Tunisia", flag: "🇹🇳", fifaRank: 41 },
    { id: "RSA", name: "South Africa", flag: "🇿🇦", fifaRank: 60 },
  ]},
  { label: "G", teams: [
    { id: "BRA", name: "Brazil", flag: "🇧🇷", fifaRank: 5 },
    { id: "EGY", name: "Egypt", flag: "🇪🇬", fifaRank: 33 },
    { id: "IRN", name: "Iran", flag: "🇮🇷", fifaRank: 20 },
    { id: "AUS", name: "Australia", flag: "🇦🇺", fifaRank: 25 },
  ]},
  { label: "H", teams: [
    { id: "POR", name: "Portugal", flag: "🇵🇹", fifaRank: 4 },
    { id: "URU", name: "Uruguay", flag: "🇺🇾", fifaRank: 11 },
    { id: "KSA", name: "Saudi Arabia", flag: "🇸🇦", fifaRank: 58 },
    { id: "CIV", name: "Côte d'Ivoire", flag: "🇨🇮", fifaRank: 45 },
  ]},
  { label: "I", teams: [
    { id: "ENG", name: "England", flag: "🏴", fifaRank: 4 },
    { id: "COL", name: "Colombia", flag: "🇨🇴", fifaRank: 14 },
    { id: "NOR", name: "Norway", flag: "🇳🇴", fifaRank: 38 },
    { id: "QAT", name: "Qatar", flag: "🇶🇦", fifaRank: 51 },
  ]},
  { label: "J", teams: [
    { id: "GER", name: "Germany", flag: "🇩🇪", fifaRank: 9 },
    { id: "SUI", name: "Switzerland", flag: "🇨🇭", fifaRank: 19 },
    { id: "KOR", name: "Korea Republic", flag: "🇰🇷", fifaRank: 22 },
    { id: "PAN", name: "Panama", flag: "🇵🇦", fifaRank: 42 },
  ]},
  { label: "K", teams: [
    { id: "ITA", name: "Italy", flag: "🇮🇹", fifaRank: 8 },
    { id: "AUT", name: "Austria", flag: "🇦🇹", fifaRank: 24 },
    { id: "GHA", name: "Ghana", flag: "🇬🇭", fifaRank: 47 },
    { id: "NZL2", name: "Curaçao", flag: "🇨🇼", fifaRank: 82 },
  ]},
  { label: "L", teams: [
    { id: "COD", name: "DR Congo", flag: "🇨🇩", fifaRank: 56 },
    { id: "PER", name: "Peru", flag: "🇵🇪", fifaRank: 32 },
    { id: "PAR", name: "Paraguay", flag: "🇵🇾", fifaRank: 35 },
    { id: "JAM", name: "Jamaica", flag: "🇯🇲", fifaRank: 53 },
  ]},
];

/** Flattened list of all 48 fixture teams with their group label. */
export const FIXTURE_TEAMS = FIXTURE_GROUPS.flatMap((g) =>
  g.teams.map((t) => ({ ...t, group_label: g.label }))
);
```

- [ ] **Step 2: Type-check**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/data/wc2026-fixtures.ts
git commit -m "feat(data): WC2026 dev fixtures (12 groups, 48 teams)"
```

---

## Task 2: Round-robin match generator (pure, TDD)

**Files:**
- Create: `lib/data/groupSchedule.ts`, `lib/data/groupSchedule.test.ts`

- [ ] **Step 1: Write the failing test `lib/data/groupSchedule.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildGroupMatches } from "@/lib/data/groupSchedule";

describe("buildGroupMatches", () => {
  const teams = ["MEX", "BEL", "SCO", "JOR"];

  it("produces exactly 6 matches for a group of 4", () => {
    expect(buildGroupMatches("A", teams)).toHaveLength(6);
  });

  it("reproduces the canonical Group-A ids (matches the existing seed)", () => {
    const ids = buildGroupMatches("A", teams).map((m) => m.id);
    expect(ids).toEqual([
      "GA-MEX-BEL", "GA-SCO-JOR", "GA-MEX-SCO", "GA-BEL-JOR", "GA-MEX-JOR", "GA-BEL-SCO",
    ]);
  });

  it("pairs every team against every other exactly once", () => {
    const ms = buildGroupMatches("A", teams);
    const pairs = ms.map((m) => [m.home_team_id, m.away_team_id].sort().join("-")).sort();
    expect(new Set(pairs).size).toBe(6); // 4 choose 2
  });

  it("assigns matchdays 1..3, two matches each", () => {
    const ms = buildGroupMatches("A", teams);
    const byDay = ms.reduce<Record<number, number>>((acc, m) => {
      acc[m.matchday] = (acc[m.matchday] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDay).toEqual({ 1: 2, 2: 2, 3: 2 });
  });

  it("tags every match with the group label and stage 'group'", () => {
    for (const m of buildGroupMatches("B", ["CAN", "MAR", "UZB", "CRC"])) {
      expect(m.group_label).toBe("B");
      expect(m.stage).toBe("group");
      expect(m.id.startsWith("GB-")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/data/groupSchedule.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/data/groupSchedule.ts`**

```typescript
export interface GeneratedMatch {
  id: string;
  stage: "group";
  group_label: string;
  home_team_id: string;
  away_team_id: string;
  matchday: number;
}

/**
 * Build the 6 round-robin matches for a group of exactly 4 teams.
 * Pairing order (teams indexed 0..3) is fixed so ids are deterministic:
 *   MD1: 0-1, 2-3   MD2: 0-2, 1-3   MD3: 0-3, 1-2
 * Match id = `G{group}-{home}-{away}`.
 */
export function buildGroupMatches(group: string, teamIds: string[]): GeneratedMatch[] {
  if (teamIds.length !== 4) {
    throw new Error(`Group ${group} must have exactly 4 teams, got ${teamIds.length}`);
  }
  const [a, b, c, d] = teamIds;
  const pairs: Array<[string, string, number]> = [
    [a, b, 1], [c, d, 1],
    [a, c, 2], [b, d, 2],
    [a, d, 3], [b, c, 3],
  ];
  return pairs.map(([home, away, matchday]) => ({
    id: `G${group}-${home}-${away}`,
    stage: "group" as const,
    group_label: group,
    home_team_id: home,
    away_team_id: away,
    matchday,
  }));
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/data/groupSchedule.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/data/groupSchedule.ts lib/data/groupSchedule.test.ts
git commit -m "feat(data): deterministic round-robin group-match generator (TDD)"
```

---

## Task 3: Seed script for all 12 groups

**Files:**
- Create: `scripts/seed.ts`
- Modify: `package.json` (add `tsx` dev dep + `seed` script)

- [ ] **Step 1: Install tsx**

Run: `cd /Users/vaamx/worldcup2026 && npm install -D tsx`

- [ ] **Step 2: Add the `seed` script to `package.json`**

In `"scripts"` add:
```json
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 3: Write `scripts/seed.ts`**

Kickoff times are derived deterministically from a fixed tournament start (no `Date.now()`), so reseeding is stable.

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { FIXTURE_GROUPS, FIXTURE_TEAMS } from "../lib/data/wc2026-fixtures";
import { buildGroupMatches } from "../lib/data/groupSchedule";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
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
```

- [ ] **Step 4: Run the seed against the local DB and verify counts**

Run (stack must be up; `.env.local` populated):
```bash
cd /Users/vaamx/worldcup2026 && npm run seed
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select count(*) as teams from public.teams; select count(*) as matches from public.matches; select count(distinct group_label) as groups from public.matches;"
```
Expected: `Upserted 48 teams`, `Upserted 72 matches`; teams = 48, matches = 72, groups = 12.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add scripts/seed.ts package.json package-lock.json
git commit -m "feat(data): seed script populating all 12 groups (npm run seed)"
```

---

## Task 4: Predictions → standings mapper (pure, TDD)

**Files:**
- Create: `lib/predictions/toStandings.ts`, `lib/predictions/toStandings.test.ts`

- [ ] **Step 1: Write the failing test `lib/predictions/toStandings.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { predictedStandings } from "@/lib/predictions/toStandings";

const teams = [
  { id: "A", fifaRank: 1 },
  { id: "B", fifaRank: 2 },
  { id: "C", fifaRank: 3 },
  { id: "D", fifaRank: 4 },
];

describe("predictedStandings", () => {
  it("returns all teams at zero when there are no predicted scores", () => {
    const table = predictedStandings(teams, []);
    expect(table).toHaveLength(4);
    expect(table.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it("counts only fully-predicted matches and ranks them", () => {
    const preds = [
      { home_team_id: "A", away_team_id: "B", predicted_home: 2, predicted_away: 0 },
      { home_team_id: "C", away_team_id: "D", predicted_home: 1, predicted_away: 1 },
      // A vs C left blank (nulls) -> ignored
      { home_team_id: "A", away_team_id: "C", predicted_home: null, predicted_away: null },
    ];
    const table = predictedStandings(teams, preds);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    expect(byId.A.points).toBe(3); // beat B
    expect(byId.A.played).toBe(1);
    expect(byId.C.points).toBe(1); // drew D
    expect(table[0].teamId).toBe("A"); // top of the table
  });

  it("uses fifaRank for tiebreaks among teams with no head-to-head", () => {
    // No predictions -> all level -> better rank first
    const table = predictedStandings(teams, []);
    expect(table.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/predictions/toStandings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/predictions/toStandings.ts`**

```typescript
import { computeGroupStandings } from "@/lib/math";
import type { PlayedMatch, TeamStanding, TiebreakInputs } from "@/lib/math";

export interface StandingTeamRef {
  id: string;
  fifaRank: number;
}

export interface PredictedScoreRow {
  home_team_id: string;
  away_team_id: string;
  predicted_home: number | null;
  predicted_away: number | null;
}

/**
 * Build the predicted group table from a user's scoreline predictions.
 * Only matches with BOTH scores filled in count as "played". All four teams
 * always appear (zeroed if unpredicted) so the table renders in full.
 */
export function predictedStandings(
  teams: StandingTeamRef[],
  predictions: PredictedScoreRow[]
): TeamStanding[] {
  const played: PlayedMatch[] = predictions
    .filter((p) => p.predicted_home !== null && p.predicted_away !== null)
    .map((p) => ({
      homeTeamId: p.home_team_id,
      awayTeamId: p.away_team_id,
      homeScore: p.predicted_home as number,
      awayScore: p.predicted_away as number,
    }));

  const tb: TiebreakInputs = {
    fifaRank: Object.fromEntries(teams.map((t) => [t.id, t.fifaRank])),
  };

  // Correct order (incl. head-to-head) for every team that has a counted match.
  const ranked = computeGroupStandings(played, tb);

  // Teams with no counted match yet aren't in `ranked`; append them at the
  // bottom ordered by FIFA rank. This PRESERVES the math module's head-to-head
  // ordering for teams that do have results (do NOT re-sort `ranked`).
  const present = new Set(ranked.map((r) => r.teamId));
  const missing = teams
    .filter((t) => !present.has(t.id))
    .sort((a, b) => a.fifaRank - b.fifaRank)
    .map<TeamStanding>((t) => ({
      teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      conduct: 0, fifaRank: t.fifaRank,
    }));

  return [...ranked, ...missing];
}
```

> Why this shape: `computeGroupStandings` already ranks teams that have results
> with the full official tiebreaker chain (head-to-head first). We must NOT re-sort
> its output, or we'd lose head-to-head ordering on a fully-predicted group. Teams
> with zero counted matches simply can't be ranked by results, so they trail by
> FIFA rank — the right UX for a partially-filled card; once a group is fully
> predicted, all four teams are in `ranked` and fully correct.

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/predictions/toStandings.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/predictions/toStandings.ts lib/predictions/toStandings.test.ts
git commit -m "feat(predict): predicted-standings mapper over the math module (TDD)"
```

---

## Task 5: View-model types + server-side data query

**Files:**
- Create: `lib/predictions/types.ts`, `lib/predictions/queries.ts`

- [ ] **Step 1: Write `lib/predictions/types.ts`**

```typescript
export interface PredictTeam {
  id: string;
  name: string;
  flag: string | null;
  fifaRank: number;
}

export interface PredictMatch {
  id: string;
  matchday: number | null;
  homeTeamId: string;
  awayTeamId: string;
  lockAt: string | null;
  status: "scheduled" | "live" | "final";
  /** Actual result (Plan 4); null until played. */
  homeScore: number | null;
  awayScore: number | null;
  /** The signed-in user's prediction, if any. */
  predictedHome: number | null;
  predictedAway: number | null;
}

export interface PredictGroup {
  label: string;
  teams: PredictTeam[];
  matches: PredictMatch[];
}
```

- [ ] **Step 2: Write `lib/predictions/queries.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";
import type { PredictGroup, PredictMatch, PredictTeam } from "@/lib/predictions/types";

/**
 * Load every group with its teams, its group matches, and merge in the
 * signed-in user's predictions. Returns groups ordered A..L.
 */
export async function getGroupsForPrediction(): Promise<PredictGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from("teams").select("id, name, flag, group_label, fifa_rank"),
    supabase
      .from("matches")
      .select("id, group_label, matchday, home_team_id, away_team_id, lock_at, status, home_score, away_score")
      .eq("stage", "group"),
  ]);

  let predByMatch = new Map<string, { predicted_home: number | null; predicted_away: number | null }>();
  if (user) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, predicted_home, predicted_away")
      .eq("user_id", user.id);
    predByMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));
  }

  const groupLabels = [...new Set((teams ?? []).map((t) => t.group_label).filter(Boolean))].sort() as string[];

  return groupLabels.map((label) => {
    const groupTeams: PredictTeam[] = (teams ?? [])
      .filter((t) => t.group_label === label)
      .map((t) => ({ id: t.id, name: t.name, flag: t.flag, fifaRank: t.fifa_rank ?? 999 }))
      .sort((a, b) => a.fifaRank - b.fifaRank);

    const groupMatches: PredictMatch[] = (matches ?? [])
      .filter((m) => m.group_label === label)
      .sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0) || a.id.localeCompare(b.id))
      .map((m) => {
        const p = predByMatch.get(m.id);
        return {
          id: m.id,
          matchday: m.matchday,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          lockAt: m.lock_at,
          status: m.status,
          homeScore: m.home_score,
          awayScore: m.away_score,
          predictedHome: p?.predicted_home ?? null,
          predictedAway: p?.predicted_away ?? null,
        };
      });

    return { label, teams: groupTeams, matches: groupMatches };
  });
}
```

- [ ] **Step 3: Type-check + build**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/predictions/types.ts lib/predictions/queries.ts
git commit -m "feat(predict): view-model types + server query (groups + matches + user predictions)"
```

---

## Task 6: Install Framer Motion + ScoreInput + PredictedTable

**Files:**
- Modify: `package.json` (framer-motion)
- Create: `components/predict/ScoreInput.tsx`, `components/predict/PredictedTable.tsx`

- [ ] **Step 1: Install framer-motion**

Run: `cd /Users/vaamx/worldcup2026 && npm install framer-motion`

- [ ] **Step 2: Write `components/predict/ScoreInput.tsx`**

```tsx
"use client";

interface ScoreInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  "aria-label": string;
}

/** A single 0–99 score box. Empty string maps to null (unpredicted). */
export function ScoreInput({ value, onChange, disabled, ...rest }: ScoreInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      disabled={disabled}
      aria-label={rest["aria-label"]}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange(null);
        const n = Math.max(0, Math.min(99, Math.floor(Number(v))));
        onChange(Number.isNaN(n) ? null : n);
      }}
      className={
        "w-11 h-12 rounded-xl text-center text-xl font-extrabold tabular-nums " +
        "bg-black/40 border outline-none transition-colors " +
        (disabled
          ? "border-white/10 text-white/50"
          : "border-[var(--bn-gold)]/40 text-white focus:border-[var(--bn-gold)]")
      }
    />
  );
}
```

- [ ] **Step 3: Write `components/predict/PredictedTable.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import type { TeamStanding } from "@/lib/math";
import type { PredictTeam } from "@/lib/predictions/types";

export function PredictedTable({
  rows,
  teamsById,
}: {
  rows: TeamStanding[];
  teamsById: Record<string, PredictTeam>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
      <div className="grid grid-cols-[1.4rem_1fr_2rem_2rem_2rem] gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">
        <span>#</span><span>Team</span><span className="text-center">P</span><span className="text-center">GD</span><span className="text-center">Pts</span>
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => {
          const t = teamsById[r.teamId];
          const qualifies = i < 2;
          return (
            <motion.li
              key={r.teamId}
              layout
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={
                "grid grid-cols-[1.4rem_1fr_2rem_2rem_2rem] items-center gap-1 rounded-lg px-2 py-2 text-sm " +
                (qualifies ? "bg-[var(--bn-success)]/10 border-l-2 border-[var(--bn-success)]" : "bg-white/[0.02]")
              }
            >
              <span className="text-white/50 font-bold">{i + 1}</span>
              <span className="flex items-center gap-2 truncate">
                <span aria-hidden>{t?.flag ?? "🏳️"}</span>
                <span className="truncate">{t?.name ?? r.teamId}</span>
              </span>
              <span className="text-center text-white/70 tabular-nums">{r.played}</span>
              <span className="text-center text-white/70 tabular-nums">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>
              <span className="text-center font-extrabold text-[var(--bn-gold)] tabular-nums">{r.points}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Build to verify**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/predict/ScoreInput.tsx components/predict/PredictedTable.tsx package.json package-lock.json
git commit -m "feat(predict): ScoreInput + animated PredictedTable (Framer Motion)"
```

---

## Task 7: MatchRow + GroupPredictor (autosave)

**Files:**
- Create: `components/predict/MatchRow.tsx`, `components/predict/GroupPredictor.tsx`

- [ ] **Step 1: Write `components/predict/MatchRow.tsx`**

```tsx
"use client";

import { ScoreInput } from "@/components/predict/ScoreInput";
import type { PredictMatch, PredictTeam } from "@/lib/predictions/types";

export function MatchRow({
  match,
  home,
  away,
  locked,
  onScore,
}: {
  match: PredictMatch;
  home: PredictTeam;
  away: PredictTeam;
  locked: boolean;
  onScore: (side: "home" | "away", value: number | null) => void;
}) {
  const showResult = match.status === "final" && match.homeScore !== null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2">
      <span className="flex w-1/3 items-center gap-1.5 justify-end text-sm">
        <span className="truncate text-right">{home.name}</span>
        <span aria-hidden>{home.flag}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <ScoreInput
          value={showResult ? match.homeScore : match.predictedHome}
          onChange={(v) => onScore("home", v)}
          disabled={locked}
          aria-label={`${home.name} score`}
        />
        <span className="text-white/30">:</span>
        <ScoreInput
          value={showResult ? match.awayScore : match.predictedAway}
          onChange={(v) => onScore("away", v)}
          disabled={locked}
          aria-label={`${away.name} score`}
        />
      </div>
      <span className="flex w-1/3 items-center gap-1.5 text-sm">
        <span aria-hidden>{away.flag}</span>
        <span className="truncate">{away.name}</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/predict/GroupPredictor.tsx`**

```tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { predictedStandings } from "@/lib/predictions/toStandings";
import { PredictedTable } from "@/components/predict/PredictedTable";
import { MatchRow } from "@/components/predict/MatchRow";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";

function isLocked(m: PredictMatch): boolean {
  if (m.status === "final" || m.status === "live") return true;
  return m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now();
}

export function GroupPredictor({ group, userId }: { group: PredictGroup; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [matches, setMatches] = useState<PredictMatch[]>(group.matches);
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const teamsById = useMemo(
    () => Object.fromEntries(group.teams.map((t) => [t.id, t])),
    [group.teams]
  );

  const standings = useMemo(
    () =>
      predictedStandings(
        group.teams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
        matches.map((m) => ({
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          predicted_home: m.predictedHome,
          predicted_away: m.predictedAway,
        }))
      ),
    [matches, group.teams]
  );

  function scheduleSave(match: PredictMatch) {
    clearTimeout(timers.current[match.id]);
    timers.current[match.id] = setTimeout(async () => {
      if (match.predictedHome === null || match.predictedAway === null) return;
      setSaving(true);
      await supabase.from("predictions").upsert(
        {
          user_id: userId,
          match_id: match.id,
          predicted_home: match.predictedHome,
          predicted_away: match.predictedAway,
        },
        { onConflict: "user_id,match_id" }
      );
      setSaving(false);
    }, 600);
  }

  function onScore(matchId: string, side: "home" | "away", value: number | null) {
    setMatches((prev) => {
      const next = prev.map((m) =>
        m.id === matchId
          ? { ...m, predictedHome: side === "home" ? value : m.predictedHome, predictedAway: side === "away" ? value : m.predictedAway }
          : m
      );
      const updated = next.find((m) => m.id === matchId)!;
      scheduleSave(updated);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <PredictedTable rows={standings} teamsById={teamsById} />
      <div className="space-y-2">
        {matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            home={teamsById[m.homeTeamId]}
            away={teamsById[m.awayTeamId]}
            locked={isLocked(m)}
            onScore={(side, v) => onScore(m.id, side, v)}
          />
        ))}
      </div>
      <p className="h-4 text-right text-xs text-white/40">{saving ? "Saving…" : "All changes saved"}</p>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/predict/MatchRow.tsx components/predict/GroupPredictor.tsx
git commit -m "feat(predict): MatchRow + GroupPredictor with debounced autosave + live table"
```

---

## Task 8: Group stepper + predict page (guided A→L)

**Files:**
- Create: `components/predict/GroupStepper.tsx`, `app/(app)/predict/predict-client.tsx`, `app/(app)/predict/page.tsx`

- [ ] **Step 1: Write `components/predict/GroupStepper.tsx`**

```tsx
"use client";

export function GroupStepper({
  labels,
  active,
  completed,
  onSelect,
}: {
  labels: string[];
  active: number;
  completed: Record<string, boolean>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, i) => {
        const isActive = i === active;
        const isDone = completed[label];
        return (
          <button
            key={label}
            onClick={() => onSelect(i)}
            aria-current={isActive}
            className={
              "h-9 w-9 rounded-full text-sm font-extrabold transition-colors " +
              (isActive
                ? "bg-[var(--bn-gold)] text-[#0a1428]"
                : isDone
                ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)] border border-[var(--bn-success)]/40"
                : "bg-white/5 text-white/60 border border-white/10")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/predict/predict-client.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { GroupPredictor } from "@/components/predict/GroupPredictor";
import { GroupStepper } from "@/components/predict/GroupStepper";
import { Button } from "@/components/ui/Button";
import type { PredictGroup } from "@/lib/predictions/types";

export function PredictClient({ groups, userId }: { groups: PredictGroup[]; userId: string }) {
  const [active, setActive] = useState(0);
  const labels = groups.map((g) => g.label);

  // A group is "complete" when all its matches have both scores filled.
  const completed = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const g of groups) {
      out[g.label] = g.matches.length > 0 && g.matches.every((m) => m.predictedHome !== null && m.predictedAway !== null);
    }
    return out;
  }, [groups]);

  const group = groups[active];
  const doneCount = Object.values(completed).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">GROUP STAGE</p>
          <h1 className="text-2xl font-black">Group {group.label}</h1>
        </div>
        <span className="text-xs text-white/50">{doneCount}/{groups.length} groups done</span>
      </div>

      <GroupStepper labels={labels} active={active} completed={completed} onSelect={setActive} />

      <GroupPredictor key={group.label} group={group} userId={userId} />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" disabled={active === 0} onClick={() => setActive((a) => Math.max(0, a - 1))}>
          ← Group {labels[Math.max(0, active - 1)]}
        </Button>
        <Button disabled={active === labels.length - 1} onClick={() => setActive((a) => Math.min(labels.length - 1, a + 1))}>
          Group {labels[Math.min(labels.length - 1, active + 1)]} →
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `app/(app)/predict/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupsForPrediction } from "@/lib/predictions/queries";
import { PredictClient } from "./predict-client";

export default async function PredictPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groups = await getGroupsForPrediction();
  if (groups.length === 0) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-white/60">No groups are loaded yet. Run <code className="text-[var(--bn-gold)]">npm run seed</code>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <PredictClient groups={groups} userId={user.id} />
    </main>
  );
}
```

- [ ] **Step 4: Add a link to the predict screen from the leagues page**

In `app/(app)/leagues/page.tsx`, add an entry point near the header. After the `<header>...</header>` block, insert:
```tsx
      <a href="/predict" className="block">
        <div className="rounded-2xl border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/10 p-4 text-center font-extrabold text-[var(--bn-gold)]">
          ⚽ Make your group predictions →
        </div>
      </a>
```

- [ ] **Step 5: Build + type-check**

Run: `cd /Users/vaamx/worldcup2026 && npm run build && npx tsc --noEmit`
Expected: build succeeds; 0 type errors; `/predict` route appears in the build output.

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add "app/(app)/predict" "app/(app)/leagues/page.tsx" components/predict/GroupStepper.tsx
git commit -m "feat(predict): guided A-L group stepper + predict page + leagues entry point"
```

---

## Task 9: Integration test — prediction write respects the lock

**Files:**
- Create: `lib/predictions/save.itest.ts`

- [ ] **Step 1: Write `lib/predictions/save.itest.ts`**

This proves the RLS lock policy end-to-end: a user can upsert a prediction for an unlocked match but is rejected for a locked one. It seeds two throwaway matches (one future-locked, one past-locked) with the service-role client, then acts as a real authenticated user.

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const password = "Password123!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user!.id, client };
}

describe("prediction writes respect the lock (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;
  const openId = `ITEST-OPEN-${stamp}`;
  const lockedId = `ITEST-LOCKED-${stamp}`;

  beforeAll(async () => {
    user = await makeUser(`pred-${stamp}@example.com`);
    // Reuse seeded Group-A teams (present from supabase/seed.sql).
    const future = "2999-01-01T00:00:00Z";
    const past = "2000-01-01T00:00:00Z";
    const { error } = await admin.from("matches").insert([
      { id: openId, stage: "group", group_label: "A", home_team_id: "MEX", away_team_id: "BEL", kickoff_at: future, lock_at: future, status: "scheduled" },
      { id: lockedId, stage: "group", group_label: "A", home_team_id: "SCO", away_team_id: "JOR", kickoff_at: past, lock_at: past, status: "scheduled" },
    ]);
    if (error) throw error;
  });

  it("allows a prediction on an unlocked match", async () => {
    const { error } = await user.client.from("predictions").upsert(
      { user_id: user.id, match_id: openId, predicted_home: 2, predicted_away: 1 },
      { onConflict: "user_id,match_id" }
    );
    expect(error).toBeNull();
  });

  it("rejects a prediction on a locked match", async () => {
    const { error } = await user.client.from("predictions").insert(
      { user_id: user.id, match_id: lockedId, predicted_home: 1, predicted_away: 0 }
    );
    expect(error).not.toBeNull(); // RLS with_check: now() < lock_at fails
  });
});
```

- [ ] **Step 2: Run against the live stack**

Run: `cd /Users/vaamx/worldcup2026 && npm run test:integration`
Expected: PASS — the Plan-2 RLS suite (6) plus these 2 new tests all pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/predictions/save.itest.ts
git commit -m "test(predict): integration test for RLS lock on prediction writes"
```

---

## Task 10: Final verification

- [ ] **Step 1: Seed full data + run all gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm run seed                 # 48 teams, 72 matches
npm test                     # unit: 25 prior + groupSchedule (5) + toStandings (3) = 33 passed
npm run test:integration     # 8 passed (6 RLS + 2 lock)
npm run build                # success; /predict route present
npx tsc --noEmit             # 0 errors
```

- [ ] **Step 2: Runtime smoke check (auth-gated route renders)**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm run dev >/tmp/wc-dev.log 2>&1 &
DEV_PID=$!
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/login && break; sleep 1; done
# unauthenticated -> redirected to /login
curl -s -o /dev/null -w "/predict (no auth): %{http_code} -> %{redirect_url}\n" http://localhost:3000/predict
kill $DEV_PID 2>/dev/null
```
Expected: `/predict (no auth): 307 -> http://localhost:3000/login` (proxy gating). Full signed-in render is verified manually (sign in via magic link at Mailpit, open `/predict`, type scores, watch the table re-sort and "Saving…/All changes saved" toggle).

- [ ] **Step 3: Confirm clean tree**

Run: `cd /Users/vaamx/worldcup2026 && git status --short`
Expected: empty.

---

## Self-Review Notes (author)

- **Spec coverage:** guided group-by-group flow → Tasks 7–8 (GroupPredictor + stepper). Every-scoreline prediction input → Tasks 6–7. Live predicted table re-sorting → Tasks 4, 6 (computeGroupStandings reuse + Framer Motion `layout`). Per-match lock at kickoff → `isLocked` (Task 7) UI + RLS enforcement proven by Task 9. Saving under RLS → Task 7 browser upsert. Data to render 12 groups → Tasks 1–3.
- **Reuse, not reinvention:** the live table is the existing pure `computeGroupStandings` fed the user's predicted scores — no duplicate standings logic. The seed reuses the tested `buildGroupMatches` generator and the fixtures module (also useful to the Plan-4 feed adapter).
- **Deferred-by-design:** real results/scores + auto-advance (Plan 4); the knockout bracket (Plan 5); celebration confetti/streaks/badges (Plan 6 polish — this plan ships the spring table re-sort and save indicator, the foundational "fun" motion). Onboarding routing decision (left to a later pass).
- **Determinism:** the seed derives kickoff times from a fixed `Date.UTC(2026,5,11,...)` constant (no `Date.now()`), so reseeding is stable. `buildGroupMatches` is pure and order-deterministic, reproducing the existing Group-A ids so the Plan-2 integration test stays valid.
- **Test split intact:** new unit tests are `*.test.ts` (Docker-free); the new lock test is `*.itest.ts` (runs only under `npm run test:integration`). Group A ordering `[MEX,BEL,SCO,JOR]` keeps `GA-*` ids stable.
- **Name/type consistency:** `predictedStandings(teams, predictions)` signature matches between Task 4 and its use in `GroupPredictor` (Task 7). `PredictGroup`/`PredictMatch`/`PredictTeam` (Task 5) are used consistently across queries, components, and the page. `buildGroupMatches(group, teamIds)` matches between Task 2, its test, and the seed script (Task 3).
```
