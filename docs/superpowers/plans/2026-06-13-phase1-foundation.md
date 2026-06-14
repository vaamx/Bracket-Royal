# Phase 1 — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + Tailwind + Supabase project skeleton with the Broadcast Night design tokens, the core database schema, and a fully unit-tested pure "competition math" module (standings + official tiebreakers, best-third ranking, prediction scoring).

**Architecture:** A Next.js 15 (App Router, TypeScript) app deployed on Vercel, talking to Supabase (Postgres + Auth + Realtime). This first plan delivers the deployable shell, the design-token foundation, the database migrations, and — most importantly — a *pure, deterministic, dependency-free* math module that encodes the FIFA 2026 rules and is exhaustively tested. Real team/schedule/results data is ingested from the results feed in a later plan, so this plan needs no external data to be complete and testable.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Vitest (unit tests), Supabase CLI (local Postgres + migrations), Framer Motion (installed, used later).

---

## Plan Sequence (Phase 1 roadmap — context only)

1. **Foundation (this plan)** — scaffold, design tokens, schema, math module.
2. Auth & Leagues — social login, profiles, create/join leagues, global league.
3. Group Predictions — guided group-by-group scoreline flow, live predicted table, locks.
4. Results Feed & Scoring Engine — feed adapter, cron poll, scoring, realtime leaderboard.
5. Knockout Bracket — `resolveBracket`, full upfront bracket UI, KO scoring.
6. Game-feel Polish — celebrations, streaks, badges, sound/haptics.

This plan implements **only item 1**. `resolveBracket` is intentionally deferred to plan 5 (it needs the real third-place-combination table, which arrives with feed data).

---

## File Structure (created by this plan)

```
package.json, tsconfig.json, next.config.ts, vitest.config.ts   # scaffold + test config
postcss.config.mjs, app/globals.css                              # Tailwind v4 + design tokens
app/layout.tsx, app/page.tsx                                     # app shell
lib/design/tokens.ts                                             # Broadcast Night tokens (TS mirror)
components/ui/Card.tsx, components/ui/Button.tsx                 # primitive components
lib/math/types.ts                                                # shared math types
lib/math/standings.ts        + lib/math/standings.test.ts        # computeGroupStandings
lib/math/thirdPlace.ts       + lib/math/thirdPlace.test.ts       # rankThirdPlaceTeams
lib/math/scoring.ts          + lib/math/scoring.test.ts          # scorePrediction
lib/math/index.ts                                                # barrel export
supabase/config.toml                                             # supabase CLI (generated)
supabase/migrations/0001_core_schema.sql                        # core tables + RLS scaffolding
supabase/seed.sql                                                # minimal dev-fixture seed
lib/supabase/client.ts, lib/supabase/server.ts                  # supabase client helpers
.env.local.example                                              # env var template
```

---

## Task 1: Scaffold the Next.js + TypeScript app

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `postcss.config.mjs`, `app/globals.css`

- [ ] **Step 1: Create the Next.js app non-interactively**

The repo already contains `.gitignore`, `docs/`, and `.claude/`. `create-next-app` refuses a non-empty dir, so scaffold in a temp dir and move files in.

Run:
```bash
cd /Users/vaamx/worldcup2026
npx --yes create-next-app@latest .nextapp \
  --ts --tailwind --eslint --app --src-dir=false \
  --import-alias "@/*" --use-npm --no-turbopack --yes
# Move scaffold into the repo root (including dotfiles), then clean up
shopt -s dotglob
mv .nextapp/* .
rm -rf .nextapp
shopt -u dotglob
```

Expected: `package.json`, `app/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `app/globals.css` now exist at repo root. If `create-next-app` already created its own `.gitignore`, keep ours (we curated it) — restore with `git checkout .gitignore` if it was overwritten.

- [ ] **Step 2: Verify it builds and runs the dev server**

Run:
```bash
cd /Users/vaamx/worldcup2026 && npm run build
```
Expected: build completes with "Compiled successfully" (the default starter page).

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Tailwind app"
```

---

## Task 2: Add Vitest and confirm the test runner works

**Files:**
- Create: `vitest.config.ts`, `lib/math/sanity.test.ts` (temporary)
- Modify: `package.json` (scripts)

- [ ] **Step 1: Install Vitest**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm install -D vitest@^2
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 3: Add the test script to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a temporary sanity test at `lib/math/sanity.test.ts`**

```typescript
import { describe, it, expect } from "vitest";

describe("vitest wiring", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npm test`
Expected: PASS — `1 passed`.

- [ ] **Step 6: Delete the sanity test and commit**

```bash
cd /Users/vaamx/worldcup2026
rm lib/math/sanity.test.ts
git add -A
git commit -m "test: add Vitest runner config"
```

---

## Task 3: Define the math module types

**Files:**
- Create: `lib/math/types.ts`

- [ ] **Step 1: Write `lib/math/types.ts`**

```typescript
/** Stage of a match in the tournament. */
export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "final" | "third";

/** Result of a single played match, from the perspective of two teams. */
export interface PlayedMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

/** Per-team conduct + ranking inputs used only as late tiebreakers. */
export interface TiebreakInputs {
  /** teamId -> conduct score (higher = WORSE; FIFA uses a negative-points card model). Default 0. */
  conduct?: Record<string, number>;
  /** teamId -> FIFA World Ranking position (lower number = better rank). Required for full tiebreaking. */
  fifaRank?: Record<string, number>;
}

/** A computed row in a group table. */
export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Conduct score carried through for tiebreaking (higher = worse). */
  conduct: number;
  /** FIFA rank carried through (lower = better); Infinity if unknown. */
  fifaRank: number;
}

/** Match outcome from the home team's perspective. */
export type Outcome = "home" | "draw" | "away";

/** A user's predicted scoreline for a match. */
export interface PredictedScore {
  home: number;
  away: number;
}

/** Configurable point values (mirrors leagues.scoring_config defaults). */
export interface GroupScoringConfig {
  exact: number; // exact scoreline
  goalDiff: number; // correct result + correct goal difference
  outcome: number; // correct result only
}

export const DEFAULT_GROUP_SCORING: GroupScoringConfig = {
  exact: 5,
  goalDiff: 3,
  outcome: 2,
};
```

- [ ] **Step 2: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/types.ts
git commit -m "feat(math): add competition math types"
```

---

## Task 4: `outcomeOf` helper (TDD)

**Files:**
- Create: `lib/math/scoring.ts`, `lib/math/scoring.test.ts`

- [ ] **Step 1: Write the failing test in `lib/math/scoring.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { outcomeOf } from "@/lib/math/scoring";

describe("outcomeOf", () => {
  it("returns home when home scores more", () => {
    expect(outcomeOf(2, 1)).toBe("home");
  });
  it("returns away when away scores more", () => {
    expect(outcomeOf(0, 3)).toBe("away");
  });
  it("returns draw when level", () => {
    expect(outcomeOf(1, 1)).toBe("draw");
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/scoring.test.ts`
Expected: FAIL — cannot find module / `outcomeOf is not a function`.

- [ ] **Step 3: Implement in `lib/math/scoring.ts`**

```typescript
import type { Outcome } from "@/lib/math/types";

export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/scoring.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/scoring.ts lib/math/scoring.test.ts
git commit -m "feat(math): add outcomeOf helper"
```

---

## Task 5: `scorePrediction` (TDD)

**Files:**
- Modify: `lib/math/scoring.ts`, `lib/math/scoring.test.ts`

- [ ] **Step 1: Add failing tests to `lib/math/scoring.test.ts`**

Append:
```typescript
import { scorePrediction } from "@/lib/math/scoring";
import { DEFAULT_GROUP_SCORING } from "@/lib/math/types";

describe("scorePrediction (default config 5/3/2/0)", () => {
  const cfg = DEFAULT_GROUP_SCORING;

  it("awards exact for a perfect scoreline", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 2, away: 1 }, cfg)).toBe(5);
  });

  it("awards goalDiff for right result + right goal difference, wrong score", () => {
    // predicted 2-1 (home by 1), actual 3-2 (home by 1)
    expect(scorePrediction({ home: 2, away: 1 }, { home: 3, away: 2 }, cfg)).toBe(3);
  });

  it("awards outcome for right result, wrong goal difference", () => {
    // predicted 1-0 (home by 1), actual 3-0 (home by 3)
    expect(scorePrediction({ home: 1, away: 0 }, { home: 3, away: 0 }, cfg)).toBe(2);
  });

  it("awards 0 for wrong result", () => {
    expect(scorePrediction({ home: 2, away: 1 }, { home: 0, away: 1 }, cfg)).toBe(0);
  });

  it("treats an exact draw as exact, not goalDiff", () => {
    expect(scorePrediction({ home: 1, away: 1 }, { home: 1, away: 1 }, cfg)).toBe(5);
  });

  it("awards outcome (not goalDiff) for a non-exact draw", () => {
    // both draws have GD 0, but scoreline differs -> correct result only
    expect(scorePrediction({ home: 0, away: 0 }, { home: 2, away: 2 }, cfg)).toBe(2);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/scoring.test.ts`
Expected: FAIL — `scorePrediction is not a function`.

- [ ] **Step 3: Implement `scorePrediction` in `lib/math/scoring.ts`**

Append:
```typescript
import type { PredictedScore, GroupScoringConfig } from "@/lib/math/types";

export function scorePrediction(
  predicted: PredictedScore,
  actual: PredictedScore,
  config: GroupScoringConfig
): number {
  const exact = predicted.home === actual.home && predicted.away === actual.away;
  if (exact) return config.exact;

  const sameOutcome =
    outcomeOf(predicted.home, predicted.away) === outcomeOf(actual.home, actual.away);
  if (!sameOutcome) return 0;

  const sameGoalDiff = predicted.home - predicted.away === actual.home - actual.away;
  // A non-exact draw has the same GD (0) but a different scoreline -> outcome only.
  if (sameGoalDiff && outcomeOf(actual.home, actual.away) !== "draw") {
    return config.goalDiff;
  }
  return config.outcome;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/scoring.test.ts`
Expected: PASS — all scoring tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/scoring.ts lib/math/scoring.test.ts
git commit -m "feat(math): add scorePrediction (5/3/2/0)"
```

---

## Task 6: `computeGroupStandings` — base table without tiebreakers (TDD)

**Files:**
- Create: `lib/math/standings.ts`, `lib/math/standings.test.ts`

- [ ] **Step 1: Write the failing test in `lib/math/standings.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { computeGroupStandings } from "@/lib/math/standings";
import type { PlayedMatch } from "@/lib/math/types";

// Group of 4: A beats B and C, draws D; B beats C and D; C beats D.
const matches: PlayedMatch[] = [
  { homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 0 },
  { homeTeamId: "A", awayTeamId: "C", homeScore: 1, awayScore: 0 },
  { homeTeamId: "A", awayTeamId: "D", homeScore: 1, awayScore: 1 },
  { homeTeamId: "B", awayTeamId: "C", homeScore: 3, awayScore: 1 },
  { homeTeamId: "B", awayTeamId: "D", homeScore: 2, awayScore: 0 },
  { homeTeamId: "C", awayTeamId: "D", homeScore: 1, awayScore: 0 },
];

describe("computeGroupStandings — base accumulation", () => {
  it("accumulates points, goals, and goal difference correctly", () => {
    const table = computeGroupStandings(matches);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));

    // A: W,W,D => 7 pts, GF 4 GA 1, GD +3
    expect(byId.A.points).toBe(7);
    expect(byId.A.goalsFor).toBe(4);
    expect(byId.A.goalsAgainst).toBe(1);
    expect(byId.A.goalDifference).toBe(3);
    expect(byId.A.played).toBe(3);

    // B: L,W,W => 6 pts, GF 5 GA 3, GD +2
    expect(byId.B.points).toBe(6);
    expect(byId.B.goalDifference).toBe(2);

    // D: D,L,L => 1 pt, GF 1 GA 4, GD -3
    expect(byId.D.points).toBe(1);
    expect(byId.D.goalDifference).toBe(-3);
  });

  it("orders the table by points first (A then B then C then D)", () => {
    const table = computeGroupStandings(matches);
    expect(table.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/standings.test.ts`
Expected: FAIL — `computeGroupStandings is not a function`.

- [ ] **Step 3: Implement base accumulation + points sort in `lib/math/standings.ts`**

```typescript
import type {
  PlayedMatch,
  TeamStanding,
  TiebreakInputs,
} from "@/lib/math/types";

function emptyRow(teamId: string, tb?: TiebreakInputs): TeamStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    conduct: tb?.conduct?.[teamId] ?? 0,
    fifaRank: tb?.fifaRank?.[teamId] ?? Number.POSITIVE_INFINITY,
  };
}

function applyMatch(row: TeamStanding, gf: number, ga: number): void {
  row.played += 1;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (gf > ga) {
    row.won += 1;
    row.points += 3;
  } else if (gf === ga) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

/** Build the per-team rows for a set of matches. */
function buildRows(
  matches: PlayedMatch[],
  tb?: TiebreakInputs
): Map<string, TeamStanding> {
  const rows = new Map<string, TeamStanding>();
  const ensure = (id: string) => {
    if (!rows.has(id)) rows.set(id, emptyRow(id, tb));
    return rows.get(id)!;
  };
  for (const m of matches) {
    const home = ensure(m.homeTeamId);
    const away = ensure(m.awayTeamId);
    applyMatch(home, m.homeScore, m.awayScore);
    applyMatch(away, m.awayScore, m.homeScore);
  }
  return rows;
}

export function computeGroupStandings(
  matches: PlayedMatch[],
  tb?: TiebreakInputs
): TeamStanding[] {
  const rows = [...buildRows(matches, tb).values()];
  // Phase-1: points-only sort. Full tiebreakers added in the next task.
  return rows.sort((a, b) => b.points - a.points);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/standings.test.ts`
Expected: PASS — both base tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/standings.ts lib/math/standings.test.ts
git commit -m "feat(math): computeGroupStandings base accumulation + points sort"
```

---

## Task 7: Official FIFA 2026 tiebreakers in `computeGroupStandings` (TDD)

The official order (level-on-points teams): (1) head-to-head points, (2) head-to-head goal difference, (3) head-to-head goals scored, (4) overall goal difference, (5) overall goals scored, (6) conduct score, (7) FIFA World Ranking.

**Files:**
- Modify: `lib/math/standings.ts`, `lib/math/standings.test.ts`

- [ ] **Step 1: Add failing tiebreaker tests to `lib/math/standings.test.ts`**

Append:
```typescript
describe("computeGroupStandings — tiebreakers", () => {
  it("breaks a points tie by head-to-head result first", () => {
    // X and Y both end on 3 pts with identical overall GD/goals,
    // but Y beat X head-to-head -> Y ranks above X.
    const m: PlayedMatch[] = [
      { homeTeamId: "X", awayTeamId: "Y", homeScore: 0, awayScore: 1 }, // Y beats X
      { homeTeamId: "X", awayTeamId: "Z", homeScore: 2, awayScore: 1 }, // X +1
      { homeTeamId: "Y", awayTeamId: "Z", homeScore: 1, awayScore: 2 }, // Y -1... fix below
    ];
    // Recompute so overall GD/goals are equal:
    // X: beat Z 2-1 (+1), lost Y 0-1 (-1) => GD 0, GF 2, 3 pts
    // Y: beat X 1-0 (+1), lost Z 1-2 (-1) => GD 0, GF 2, 3 pts
    // Z: beat Y 2-1 (+1), lost X 1-2 (-1) => GD 0, GF 3, 3 pts -> Z top on goals
    const table = computeGroupStandings(m);
    const order = table.map((r) => r.teamId);
    // Z first (more overall goals among the 3-way tie's H2H is equal, falls to overall goals)
    expect(order[0]).toBe("Z");
    // Between X and Y (H2H: Y beat X) Y ranks above X
    expect(order.indexOf("Y")).toBeLessThan(order.indexOf("X"));
  });

  it("falls back to overall goal difference when head-to-head is level", () => {
    // P and Q both 3 pts, never played each other's mini-table decisive;
    // give Q a better overall GD.
    const m: PlayedMatch[] = [
      { homeTeamId: "P", awayTeamId: "R", homeScore: 1, awayScore: 0 }, // P +1
      { homeTeamId: "Q", awayTeamId: "R", homeScore: 3, awayScore: 0 }, // Q +3
      { homeTeamId: "P", awayTeamId: "Q", homeScore: 1, awayScore: 1 }, // draw -> H2H level
    ];
    // P: 1-0, 1-1 => 4 pts GD +1 ; Q: 3-0, 1-1 => 4 pts GD +3 -> Q above P
    const table = computeGroupStandings(m);
    const order = table.map((r) => r.teamId);
    expect(order.indexOf("Q")).toBeLessThan(order.indexOf("P"));
  });

  it("uses FIFA rank as the final tiebreaker when all else is equal", () => {
    // Two teams play only each other, 0-0; identical everything; rank decides.
    const m: PlayedMatch[] = [
      { homeTeamId: "L", awayTeamId: "H", homeScore: 0, awayScore: 0 },
    ];
    const table = computeGroupStandings(m, { fifaRank: { L: 3, H: 20 } });
    expect(table.map((r) => r.teamId)).toEqual(["L", "H"]); // L is better-ranked (3 < 20)
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/standings.test.ts`
Expected: FAIL — tiebreaker tests fail (current sort is points-only).

- [ ] **Step 3: Replace the sort in `lib/math/standings.ts` with the full comparator**

Replace the body of `computeGroupStandings` and add the helper functions below it:

```typescript
export function computeGroupStandings(
  matches: PlayedMatch[],
  tb?: TiebreakInputs
): TeamStanding[] {
  const rows = [...buildRows(matches, tb).values()];

  // Sort by points desc, then resolve ties among equal-points groups.
  rows.sort((a, b) => b.points - a.points);

  const result: TeamStanding[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].points === rows[i].points) j++;
    const tiedGroup = rows.slice(i, j);
    if (tiedGroup.length === 1) {
      result.push(tiedGroup[0]);
    } else {
      result.push(...resolveTies(tiedGroup, matches));
    }
    i = j;
  }
  return result;
}

/** Resolve a set of teams that are level on points, per FIFA 2026 order. */
function resolveTies(
  tied: TeamStanding[],
  allMatches: PlayedMatch[]
): TeamStanding[] {
  const tiedIds = new Set(tied.map((r) => r.teamId));
  // Mini-table over matches played ONLY between the tied teams.
  const h2hMatches = allMatches.filter(
    (m) => tiedIds.has(m.homeTeamId) && tiedIds.has(m.awayTeamId)
  );
  const h2h = buildRows(h2hMatches);
  const h2hOf = (id: string) => h2h.get(id);

  return [...tied].sort((a, b) => {
    const ha = h2hOf(a.teamId);
    const hb = h2hOf(b.teamId);
    // (1) head-to-head points
    const hp = (hb?.points ?? 0) - (ha?.points ?? 0);
    if (hp !== 0) return hp;
    // (2) head-to-head goal difference
    const hgd = (hb?.goalDifference ?? 0) - (ha?.goalDifference ?? 0);
    if (hgd !== 0) return hgd;
    // (3) head-to-head goals scored
    const hgf = (hb?.goalsFor ?? 0) - (ha?.goalsFor ?? 0);
    if (hgf !== 0) return hgf;
    // (4) overall goal difference
    if (b.goalDifference !== a.goalDifference)
      return b.goalDifference - a.goalDifference;
    // (5) overall goals scored
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // (6) conduct score (higher = worse, so ascending)
    if (a.conduct !== b.conduct) return a.conduct - b.conduct;
    // (7) FIFA World Ranking (lower = better, ascending)
    return a.fifaRank - b.fifaRank;
  });
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/standings.test.ts`
Expected: PASS — base + tiebreaker tests all pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/standings.ts lib/math/standings.test.ts
git commit -m "feat(math): official FIFA 2026 group tiebreakers (H2H-first)"
```

---

## Task 8: `rankThirdPlaceTeams` — select the 8 best thirds (TDD)

Ranking order for third-placed teams: points → goal difference → goals scored → conduct → FIFA rank. Top 8 of the 12 advance.

**Files:**
- Create: `lib/math/thirdPlace.ts`, `lib/math/thirdPlace.test.ts`

- [ ] **Step 1: Write the failing test in `lib/math/thirdPlace.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { rankThirdPlaceTeams } from "@/lib/math/thirdPlace";
import type { TeamStanding } from "@/lib/math/types";

function row(teamId: string, points: number, gd: number, gf: number): TeamStanding {
  return {
    teamId, played: 3, won: 0, drawn: 0, lost: 0,
    goalsFor: gf, goalsAgainst: gf - gd, goalDifference: gd,
    points, conduct: 0, fifaRank: Number.POSITIVE_INFINITY,
  };
}

describe("rankThirdPlaceTeams", () => {
  it("returns the top 8 of 12 ordered by points, then GD, then goals", () => {
    // 12 third-placed teams, descending quality T1..T12.
    const thirds: TeamStanding[] = Array.from({ length: 12 }, (_, k) =>
      row(`T${k + 1}`, 12 - k, 12 - k, 20 - k)
    );
    const best = rankThirdPlaceTeams(thirds);
    expect(best).toHaveLength(8);
    expect(best.map((r) => r.teamId)).toEqual([
      "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8",
    ]);
  });

  it("breaks equal points by goal difference then goals scored", () => {
    const thirds: TeamStanding[] = [
      row("A", 4, 1, 3),
      row("B", 4, 2, 3), // better GD
      row("C", 4, 2, 5), // same GD as B, more goals -> above B
    ];
    const best = rankThirdPlaceTeams(thirds);
    expect(best.map((r) => r.teamId)).toEqual(["C", "B", "A"]);
  });

  it("uses FIFA rank as the final tiebreaker", () => {
    const a = row("A", 3, 0, 2); a.fifaRank = 10;
    const b = row("B", 3, 0, 2); b.fifaRank = 4;
    const best = rankThirdPlaceTeams([a, b]);
    expect(best.map((r) => r.teamId)).toEqual(["B", "A"]); // 4 < 10
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/thirdPlace.test.ts`
Expected: FAIL — `rankThirdPlaceTeams is not a function`.

- [ ] **Step 3: Implement `lib/math/thirdPlace.ts`**

```typescript
import type { TeamStanding } from "@/lib/math/types";

/**
 * Rank all third-placed teams and return the best `count` (default 8).
 * Order: points, goal difference, goals scored, conduct (asc), FIFA rank (asc).
 */
export function rankThirdPlaceTeams(
  thirds: TeamStanding[],
  count = 8
): TeamStanding[] {
  return [...thirds]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.conduct !== b.conduct) return a.conduct - b.conduct;
      return a.fifaRank - b.fifaRank;
    })
    .slice(0, count);
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/math/thirdPlace.test.ts`
Expected: PASS — all third-place tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/thirdPlace.ts lib/math/thirdPlace.test.ts
git commit -m "feat(math): rankThirdPlaceTeams (best 8 of 12)"
```

---

## Task 9: Barrel export + full math suite green

**Files:**
- Create: `lib/math/index.ts`

- [ ] **Step 1: Write `lib/math/index.ts`**

```typescript
export * from "@/lib/math/types";
export { outcomeOf, scorePrediction } from "@/lib/math/scoring";
export { computeGroupStandings } from "@/lib/math/standings";
export { rankThirdPlaceTeams } from "@/lib/math/thirdPlace";
```

- [ ] **Step 2: Run the full test suite**

Run: `cd /Users/vaamx/worldcup2026 && npm test`
Expected: PASS — all scoring, standings, and third-place tests pass; 0 failures.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/math/index.ts
git commit -m "feat(math): barrel export for the competition math module"
```

---

## Task 10: Broadcast Night design tokens + global styles

**Files:**
- Create: `lib/design/tokens.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Write `lib/design/tokens.ts`**

```typescript
/** Broadcast Night palette + motion tokens. Single source of truth for theme values. */
export const tokens = {
  color: {
    bg: "#0a1428",
    bgDeep: "#060c1a",
    surface: "rgba(255,255,255,0.04)",
    surfaceBorder: "rgba(255,255,255,0.12)",
    gold: "#d4af37",
    goldBright: "#f4d56a",
    accent: "#7c5cff",
    success: "#4ade80",
    warn: "#facc15",
    text: "#e8edf7",
    textMuted: "#8694b3",
  },
  radius: { card: "16px", input: "10px", pill: "999px" },
  motion: { spring: { type: "spring", stiffness: 420, damping: 30 } },
} as const;
```

- [ ] **Step 2: Add the theme variables and base background to `app/globals.css`**

After the existing `@import "tailwindcss";` line, append:
```css
:root {
  --bn-bg: #0a1428;
  --bn-bg-deep: #060c1a;
  --bn-gold: #d4af37;
  --bn-gold-bright: #f4d56a;
  --bn-accent: #7c5cff;
  --bn-success: #4ade80;
  --bn-text: #e8edf7;
  --bn-text-muted: #8694b3;
}

body {
  background:
    radial-gradient(1200px 600px at 50% -10%, #0f1d3a 0%, var(--bn-bg) 55%, var(--bn-bg-deep) 100%);
  color: var(--bn-text);
  min-height: 100dvh;
}
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/design/tokens.ts app/globals.css
git commit -m "feat(ui): Broadcast Night design tokens + global theme"
```

---

## Task 11: Primitive UI components (Card, Button)

**Files:**
- Create: `components/ui/Card.tsx`, `components/ui/Button.tsx`

- [ ] **Step 1: Write `components/ui/Card.tsx`**

```tsx
import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm " +
        "shadow-[0_20px_50px_rgba(0,0,0,0.4)] p-4 " +
        className
      }
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write `components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "gold" | "ghost";

export function Button({
  children,
  variant = "gold",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 h-11 font-extrabold " +
    "text-sm transition-transform active:scale-95 disabled:opacity-50";
  const styles =
    variant === "gold"
      ? "bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-[#0a1428]"
      : "border border-white/15 text-white/90 hover:bg-white/5";
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: Render them on the home page to verify (replace `app/page.tsx`)**

```tsx
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <header className="text-center">
        <p className="text-xs tracking-[3px] text-[var(--bn-accent)] font-bold">
          FIFA WORLD CUP 2026 · PREDICTIONS
        </p>
        <h1 className="mt-2 text-3xl font-black">Bracket Royale</h1>
      </header>
      <Card>
        <p className="text-sm text-white/70">
          Predict every match. Build your bracket. Climb the leaderboard.
        </p>
        <div className="mt-4 flex gap-3">
          <Button>Get started</Button>
          <Button variant="ghost">How it works</Button>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Build to verify**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/ui/Card.tsx components/ui/Button.tsx app/page.tsx
git commit -m "feat(ui): Card + Button primitives and themed home screen"
```

---

## Task 12: Initialize Supabase locally + core schema migration

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/0001_core_schema.sql`
- Modify: `package.json` (devDependency)

- [ ] **Step 1: Add the Supabase CLI as a dev dependency and init**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm install -D supabase@^2
npx supabase init
```
When prompted to generate VS Code settings / Deno config, answer `n`.
Expected: `supabase/config.toml` created.

- [ ] **Step 2: Create the migration file `supabase/migrations/0001_core_schema.sql`**

```sql
-- Core schema for World Cup 2026 predictions (Phase 1).

create table public.teams (
  id text primary key,                 -- 3-letter code, e.g. 'MEX'
  name text not null,
  flag text,
  group_label text,                    -- 'A'..'L', nullable until draw ingested
  fifa_rank int
);

create table public.matches (
  id text primary key,
  stage text not null check (stage in ('group','r32','r16','qf','sf','final','third')),
  group_label text,
  bracket_slot text,                   -- e.g. '1A','2B','W74', null for groups
  home_team_id text references public.teams(id),
  away_team_id text references public.teams(id),
  kickoff_at timestamptz,
  lock_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','final')),
  home_score int,
  away_score int,
  winner_team_id text references public.teams(id),
  venue text
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique not null,
  owner_id uuid references public.profiles(id),
  scoring_config jsonb not null default
    '{"exact":5,"goalDiff":3,"outcome":2,"qualWinner":3,"qualTop2":2,"qualThird":2,"ko":{"r32":10,"r16":15,"qf":25,"sf":40,"champion":60,"exactBonus":3}}'::jsonb,
  is_global boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.league_members (
  league_id uuid references public.leagues(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  match_id text not null references public.matches(id),
  predicted_home int,
  predicted_away int,
  predicted_winner_team_id text references public.teams(id),
  locked boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create table public.league_standings (
  league_id uuid references public.leagues(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  points int not null default 0,
  rank int,
  exact_count int not null default 0,
  streak int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table public.achievements (
  user_id uuid references public.profiles(id) on delete cascade,
  badge_key text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);

-- Enable Row Level Security (policies are added in the Auth & Leagues plan).
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.predictions enable row level security;
alter table public.league_standings enable row level security;
alter table public.achievements enable row level security;

-- Reference data (teams, matches) is world-readable.
alter table public.teams enable row level security;
alter table public.matches enable row level security;
create policy "teams readable by all" on public.teams for select using (true);
create policy "matches readable by all" on public.matches for select using (true);
```

- [ ] **Step 3: Start the local Supabase stack and apply the migration**

Run (Docker must be running):
```bash
cd /Users/vaamx/worldcup2026
npx supabase start
npx supabase db reset
```
Expected: `supabase start` prints API URL / anon key; `db reset` applies `0001_core_schema.sql` with no errors ("Applying migration 0001_core_schema.sql...").

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/config.toml supabase/migrations/0001_core_schema.sql package.json package-lock.json
git commit -m "feat(db): supabase init + core schema migration"
```

---

## Task 13: Minimal dev-fixture seed

A tiny seed so local dev has data before the feed plan lands. Not the real draw — real teams/schedule are ingested from the feed later.

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Write `supabase/seed.sql`**

```sql
-- Dev-only fixture data. Real WC2026 teams/schedule come from the results feed.
insert into public.teams (id, name, flag, group_label, fifa_rank) values
  ('MEX','Mexico','🇲🇽','A',15),
  ('BEL','Belgium','🇧🇪','A',6),
  ('SCO','Scotland','🏴','A',39),
  ('JOR','Jordan','🇯🇴','A',64)
on conflict (id) do nothing;

insert into public.matches
  (id, stage, group_label, home_team_id, away_team_id, kickoff_at, lock_at, status) values
  ('GA-MEX-BEL','group','A','MEX','BEL','2026-06-11T18:00:00Z','2026-06-11T18:00:00Z','scheduled'),
  ('GA-SCO-JOR','group','A','SCO','JOR','2026-06-11T21:00:00Z','2026-06-11T21:00:00Z','scheduled'),
  ('GA-MEX-SCO','group','A','MEX','SCO','2026-06-15T18:00:00Z','2026-06-15T18:00:00Z','scheduled'),
  ('GA-BEL-JOR','group','A','BEL','JOR','2026-06-15T21:00:00Z','2026-06-15T21:00:00Z','scheduled'),
  ('GA-MEX-JOR','group','A','MEX','JOR','2026-06-19T18:00:00Z','2026-06-19T18:00:00Z','scheduled'),
  ('GA-BEL-SCO','group','A','BEL','SCO','2026-06-19T18:00:00Z','2026-06-19T18:00:00Z','scheduled')
on conflict (id) do nothing;
```

- [ ] **Step 2: Apply seed via db reset**

Run:
```bash
cd /Users/vaamx/worldcup2026 && npx supabase db reset
```
Expected: migration + seed applied; final line shows seeding completed with no errors.

- [ ] **Step 3: Verify the rows landed**

Run:
```bash
cd /Users/vaamx/worldcup2026
npx supabase db query "select count(*) as teams from public.teams; select count(*) as matches from public.matches;" 2>/dev/null \
  || echo "If 'db query' is unavailable in this CLI version, open Studio (printed by 'supabase start') and check the teams/matches tables."
```
Expected: `teams = 4`, `matches = 6` (or confirm visually in Studio).

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/seed.sql
git commit -m "feat(db): minimal dev-fixture seed (Group A)"
```

---

## Task 14: Supabase client helpers + env template

**Files:**
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `.env.local.example`

- [ ] **Step 1: Install the Supabase JS libraries**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Write `.env.local.example`**

```bash
# Copy to .env.local and fill from `npx supabase start` output (local) or your project (prod).
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key
# Server-only secret (never expose to the client). Used by the feed/scoring jobs later.
SUPABASE_SERVICE_ROLE_KEY=replace-with-local-service-role-key
```

- [ ] **Step 3: Write `lib/supabase/client.ts` (browser client)**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

- [ ] **Step 4: Write `lib/supabase/server.ts` (server client)**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component; safe to ignore when middleware refreshes sessions.
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Create `.env.local` and verify the build**

Run:
```bash
cd /Users/vaamx/worldcup2026
cp .env.local.example .env.local
# Paste the real anon + service_role keys from `npx supabase start` into .env.local
npm run build
```
Expected: build succeeds (`.env.local` is gitignored).

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/supabase/client.ts lib/supabase/server.ts .env.local.example package.json package-lock.json
git commit -m "feat(db): supabase browser/server client helpers + env template"
```

---

## Task 15: Final verification of the foundation

- [ ] **Step 1: Full test suite green**

Run: `cd /Users/vaamx/worldcup2026 && npm test`
Expected: PASS — all math tests pass, 0 failures.

- [ ] **Step 2: Production build green**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Confirm clean git state**

Run: `cd /Users/vaamx/worldcup2026 && git status --short`
Expected: empty output (everything committed).

---

## Self-Review Notes (author)

- **Spec coverage:** Architecture §5 (Next/Tailwind/Supabase/Vercel) → Tasks 1, 10–14. Data model §6 → Task 12. Math module §7: `computeGroupStandings` + tiebreakers §3.1 → Tasks 6–7; `rankThirdPlaceTeams` §3.2 → Task 8; `scorePrediction` §4 → Tasks 4–5. `resolveBracket` is **explicitly deferred** to plan 5 (needs real third-place-combination data). Design system §10 → Tasks 10–11. Security §9: RLS **enabled** here (Task 12); **policies** are added in the Auth & Leagues plan (they depend on auth + league membership), noted in the migration comment.
- **Deferred-by-design (not gaps):** auth/social login, league create/join, the prediction UI, the feed/cron/scoring runtime, and the bracket — these are plans 2–6 in the roadmap above.
- **Type consistency:** `GroupScoringConfig` keys (`exact`/`goalDiff`/`outcome`) match between `types.ts`, `scoring.ts`, and the leagues `scoring_config` default JSON in the migration. `TeamStanding` fields are identical across `standings.ts`, `thirdPlace.ts`, and their tests.
