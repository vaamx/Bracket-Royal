# Phase 1 — Plan 5: Knockout Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the real Round-of-32 from group results, advance the actual bracket as knockout results come in, and score everyone's knockout predictions (per-round advancers + champion + the best-third-place bonus) — all in tested, pure logic plus a service wired into the existing scoring run.

**Architecture:** A fixed bracket **structure** (16 R32 ties + the winner/loser "feeds-into" tree to the Final and third-place playoff) lives in code. Pure functions resolve qualifiers from group standings (reusing `computeGroupStandings` + `rankThirdPlaceTeams`), fill the R32, advance actual winners forward, and score a user's knockout picks set-by-round (the standard bracket model, robust to each user's bracket diverging from reality). A service-role step resolves R32 once groups finish and advances winners as KO matches finalize; `runScoring` gains knockout points + the best-third bonus. **No UI** — the interactive bracket is Plan 6; this plan makes the data and math correct first.

**Tech Stack:** TypeScript, the existing `lib/math` module, Supabase service-role client (injected, Node-safe), Vitest (unit + integration), `tsx` (seed).

**Scope note:** Knockout predictions are **winner-advancer picks** (`predictions.predicted_winner_team_id` per KO match). The optional exact-KO-scoreline bonus is **not** in scope (KO picks are winner-only). The third-place→R32 slot routing uses a deterministic rank assignment (documented house rule); the official FIFA combination table can replace one function later without touching the structure or scoring.

---

## File Structure

```
lib/bracket/types.ts                          # KO match + slot-spec + feeds types
lib/bracket/structure.ts  + .test.ts           # the 32 KO matches, R32 slot template, feeds tree (TDD: shape invariants)
lib/bracket/resolve.ts    + .test.ts           # computeQualifiers + resolveR32 (TDD) — reuses math
lib/bracket/advance.ts    + .test.ts           # advanceActualBracket: place actual winners into later rounds (TDD)
lib/scoring/knockoutScore.ts + .test.ts        # scoreUserKnockout (per-round advancers + champion + best-third bonus) (TDD)
scripts/seed.ts                                # MODIFY: also seed the 32 knockout match rows
lib/scoring/run.ts                             # MODIFY: resolveAndAdvance() + knockout points in runScoring
lib/scoring/run.itest.ts                       # MODIFY (or add bracket.itest.ts): KO resolve + score integration
```

---

## Task 1: Bracket types + structure (TDD on invariants)

**Files:**
- Create: `lib/bracket/types.ts`, `lib/bracket/structure.ts`, `lib/bracket/structure.test.ts`

- [ ] **Step 1: Write `lib/bracket/types.ts`**

```typescript
export type KnockoutStage = "r32" | "r16" | "qf" | "sf" | "final" | "third";

/** Which qualifier fills an R32 slot. */
export type SlotSpec =
  | { kind: "winner"; group: string }   // 1st of group
  | { kind: "runner"; group: string }   // 2nd of group
  | { kind: "third"; seed: number };     // best-third rank index 0..7

/** Where a match's winner (and, for semis, loser) flows next. */
export interface Feed {
  matchId: string;
  side: "home" | "away";
}

export interface KnockoutMatch {
  id: string;          // e.g. "R32-1", "F-1", "3RD-1"
  stage: KnockoutStage;
  /** R32 only: how its two qualifier slots are filled. */
  home?: SlotSpec;
  away?: SlotSpec;
  /** Winner advances here (null for the final / third-place). */
  winnerTo: Feed | null;
  /** Semis only: loser drops to the third-place playoff. */
  loserTo?: Feed;
}
```

- [ ] **Step 2: Write `lib/bracket/structure.ts`**

```typescript
import type { KnockoutMatch, SlotSpec } from "@/lib/bracket/types";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// The 16 R32 ties (home/away qualifier specs). Uses each group winner (1A–1L)
// and runner-up (2A–2L) once, plus the 8 best thirds (seeds 0–7).
// House layout (deterministic; not the official FIFA routing — see plan scope note).
const R32_TEMPLATE: Array<[SlotSpec, SlotSpec]> = [
  [{ kind: "winner", group: "A" }, { kind: "third", seed: 0 }],
  [{ kind: "winner", group: "B" }, { kind: "third", seed: 1 }],
  [{ kind: "winner", group: "C" }, { kind: "third", seed: 2 }],
  [{ kind: "winner", group: "D" }, { kind: "third", seed: 3 }],
  [{ kind: "winner", group: "E" }, { kind: "third", seed: 4 }],
  [{ kind: "winner", group: "F" }, { kind: "third", seed: 5 }],
  [{ kind: "winner", group: "G" }, { kind: "third", seed: 6 }],
  [{ kind: "winner", group: "H" }, { kind: "third", seed: 7 }],
  [{ kind: "winner", group: "I" }, { kind: "runner", group: "A" }],
  [{ kind: "winner", group: "J" }, { kind: "runner", group: "B" }],
  [{ kind: "winner", group: "K" }, { kind: "runner", group: "C" }],
  [{ kind: "winner", group: "L" }, { kind: "runner", group: "D" }],
  [{ kind: "runner", group: "E" }, { kind: "runner", group: "F" }],
  [{ kind: "runner", group: "G" }, { kind: "runner", group: "H" }],
  [{ kind: "runner", group: "I" }, { kind: "runner", group: "J" }],
  [{ kind: "runner", group: "K" }, { kind: "runner", group: "L" }],
];

/** Build the full 32-match knockout structure with the feeds tree. */
function build(): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // R32: winner of R32-(2j-1) -> R16-j home, R32-(2j) -> R16-j away
  R32_TEMPLATE.forEach(([home, away], i) => {
    const n = i + 1;
    const r16 = Math.ceil(n / 2);
    matches.push({
      id: `R32-${n}`, stage: "r32", home, away,
      winnerTo: { matchId: `R16-${r16}`, side: n % 2 === 1 ? "home" : "away" },
    });
  });

  // R16 (8): winner of R16-(2j-1) -> QF-j home, R16-(2j) -> QF-j away
  for (let n = 1; n <= 8; n++) {
    const qf = Math.ceil(n / 2);
    matches.push({
      id: `R16-${n}`, stage: "r16",
      winnerTo: { matchId: `QF-${qf}`, side: n % 2 === 1 ? "home" : "away" },
    });
  }

  // QF (4): winner of QF-(2j-1) -> SF-j home, QF-(2j) -> SF-j away
  for (let n = 1; n <= 4; n++) {
    const sf = Math.ceil(n / 2);
    matches.push({
      id: `QF-${n}`, stage: "qf",
      winnerTo: { matchId: `SF-${sf}`, side: n % 2 === 1 ? "home" : "away" },
    });
  }

  // SF (2): winner -> Final; loser -> third-place playoff
  matches.push({ id: "SF-1", stage: "sf", winnerTo: { matchId: "F-1", side: "home" }, loserTo: { matchId: "3RD-1", side: "home" } });
  matches.push({ id: "SF-2", stage: "sf", winnerTo: { matchId: "F-1", side: "away" }, loserTo: { matchId: "3RD-1", side: "away" } });

  matches.push({ id: "F-1", stage: "final", winnerTo: null });
  matches.push({ id: "3RD-1", stage: "third", winnerTo: null });

  return matches;
}

export const KNOCKOUT_MATCHES: KnockoutMatch[] = build();
export const KNOCKOUT_BY_ID: Map<string, KnockoutMatch> = new Map(KNOCKOUT_MATCHES.map((m) => [m.id, m]));
export { GROUPS };

/** Match ids for a given stage, in order. */
export function stageMatchIds(stage: KnockoutMatch["stage"]): string[] {
  return KNOCKOUT_MATCHES.filter((m) => m.stage === stage).map((m) => m.id);
}
```

- [ ] **Step 3: Write the failing test `lib/bracket/structure.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { KNOCKOUT_MATCHES, KNOCKOUT_BY_ID, stageMatchIds } from "@/lib/bracket/structure";

describe("knockout structure", () => {
  it("has 32 matches: 16 R32, 8 R16, 4 QF, 2 SF, 1 final, 1 third", () => {
    expect(KNOCKOUT_MATCHES).toHaveLength(32);
    expect(stageMatchIds("r32")).toHaveLength(16);
    expect(stageMatchIds("r16")).toHaveLength(8);
    expect(stageMatchIds("qf")).toHaveLength(4);
    expect(stageMatchIds("sf")).toHaveLength(2);
    expect(stageMatchIds("final")).toHaveLength(1);
    expect(stageMatchIds("third")).toHaveLength(1);
  });

  it("uses every group winner and runner once across R32, plus 8 thirds", () => {
    const r32 = KNOCKOUT_MATCHES.filter((m) => m.stage === "r32");
    const specs = r32.flatMap((m) => [m.home!, m.away!]);
    expect(specs).toHaveLength(32);
    const winners = specs.filter((s) => s.kind === "winner").map((s) => (s as { group: string }).group).sort();
    const runners = specs.filter((s) => s.kind === "runner").map((s) => (s as { group: string }).group).sort();
    const thirds = specs.filter((s) => s.kind === "third").map((s) => (s as { seed: number }).seed).sort((a, b) => a - b);
    expect(winners).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L"]);
    expect(runners).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L"]);
    expect(thirds).toEqual([0,1,2,3,4,5,6,7]);
  });

  it("wires every non-terminal match's winner into a valid later slot", () => {
    for (const m of KNOCKOUT_MATCHES) {
      if (m.stage === "final" || m.stage === "third") {
        expect(m.winnerTo).toBeNull();
      } else {
        expect(m.winnerTo).not.toBeNull();
        expect(KNOCKOUT_BY_ID.has(m.winnerTo!.matchId)).toBe(true);
      }
    }
  });

  it("drops both semifinal losers into the third-place playoff", () => {
    const sf = KNOCKOUT_MATCHES.filter((m) => m.stage === "sf");
    expect(sf.every((m) => m.loserTo?.matchId === "3RD-1")).toBe(true);
  });
});
```

- [ ] **Step 4: Run (fail → pass)**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/structure.test.ts`
Expected: FAIL first (module missing), then after Steps 1-2 exist, PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/types.ts lib/bracket/structure.ts lib/bracket/structure.test.ts
git commit -m "feat(bracket): knockout structure (32 matches + feeds tree) with invariant tests"
```

---

## Task 2: Resolve qualifiers + fill R32 (pure, TDD)

**Files:**
- Create: `lib/bracket/resolve.ts`, `lib/bracket/resolve.test.ts`

- [ ] **Step 1: Write the failing test `lib/bracket/resolve.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { resolveR32, type Qualifiers } from "@/lib/bracket/resolve";

function qualifiers(): Qualifiers {
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  for (const g of ["A","B","C","D","E","F","G","H","I","J","K","L"]) {
    winners[g] = `1${g}`;
    runners[g] = `2${g}`;
  }
  const thirds = ["T0","T1","T2","T3","T4","T5","T6","T7"];
  return { winners, runners, thirds };
}

describe("resolveR32", () => {
  it("fills all 16 ties from the qualifier set", () => {
    const ties = resolveR32(qualifiers());
    expect(ties.size).toBe(16);
    expect(ties.get("R32-1")).toEqual({ homeTeamId: "1A", awayTeamId: "T0" });
    expect(ties.get("R32-9")).toEqual({ homeTeamId: "1I", awayTeamId: "2A" });
    expect(ties.get("R32-16")).toEqual({ homeTeamId: "2K", awayTeamId: "2L" });
  });

  it("places each qualifier exactly once", () => {
    const ties = [...resolveR32(qualifiers()).values()];
    const all = ties.flatMap((t) => [t.homeTeamId, t.awayTeamId]);
    expect(new Set(all).size).toBe(32);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/resolve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/bracket/resolve.ts`**

```typescript
import { computeGroupStandings, rankThirdPlaceTeams } from "@/lib/math";
import type { PlayedMatch, TiebreakInputs, TeamStanding } from "@/lib/math";
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";
import type { SlotSpec } from "@/lib/bracket/types";

export interface Qualifiers {
  winners: Record<string, string>; // group -> teamId (1st)
  runners: Record<string, string>; // group -> teamId (2nd)
  thirds: string[];                // 8 best-third teamIds, best first
}

export interface ResolvedTie {
  homeTeamId: string;
  awayTeamId: string;
}

interface GroupMatch extends PlayedMatch {
  group: string;
}
interface QualTeam {
  id: string;
  group: string;
  fifaRank: number;
}

/** Compute winners, runners, and the 8 best thirds from final group results. */
export function computeQualifiers(matches: GroupMatch[], teams: QualTeam[]): Qualifiers {
  const groups = [...new Set(teams.map((t) => t.group))];
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  const thirdRows: TeamStanding[] = [];

  for (const g of groups) {
    const gm = matches.filter((m) => m.group === g);
    const gt = teams.filter((t) => t.group === g);
    const tb: TiebreakInputs = { fifaRank: Object.fromEntries(gt.map((t) => [t.id, t.fifaRank])) };
    const table = computeGroupStandings(gm, tb);
    if (table[0]) winners[g] = table[0].teamId;
    if (table[1]) runners[g] = table[1].teamId;
    if (table[2]) thirdRows.push(table[2]);
  }

  const thirds = rankThirdPlaceTeams(thirdRows, 8).map((r) => r.teamId);
  return { winners, runners, thirds };
}

/** Fill the 16 R32 ties from a qualifier set. */
export function resolveR32(q: Qualifiers): Map<string, ResolvedTie> {
  const pick = (spec: SlotSpec): string => {
    if (spec.kind === "winner") return q.winners[spec.group];
    if (spec.kind === "runner") return q.runners[spec.group];
    return q.thirds[spec.seed];
  };
  const out = new Map<string, ResolvedTie>();
  for (const m of KNOCKOUT_MATCHES) {
    if (m.stage !== "r32") continue;
    out.set(m.id, { homeTeamId: pick(m.home!), awayTeamId: pick(m.away!) });
  }
  return out;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/resolve.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/resolve.ts lib/bracket/resolve.test.ts
git commit -m "feat(bracket): computeQualifiers + resolveR32 (TDD, reuses math)"
```

---

## Task 3: Advance the actual bracket (pure, TDD)

**Files:**
- Create: `lib/bracket/advance.ts`, `lib/bracket/advance.test.ts`

- [ ] **Step 1: Write the failing test `lib/bracket/advance.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { advanceActualBracket, type KOResult } from "@/lib/bracket/advance";

describe("advanceActualBracket", () => {
  it("places R32 winners into the correct R16 slots", () => {
    // R32-1 and R32-2 both feed R16-1 (home, away respectively).
    const results: KOResult[] = [
      { matchId: "R32-1", winnerTeamId: "1A", loserTeamId: "T0" },
      { matchId: "R32-2", winnerTeamId: "1B", loserTeamId: "T1" },
    ];
    const slots = advanceActualBracket(results);
    expect(slots.get("R16-1")).toEqual({ homeTeamId: "1A", awayTeamId: "1B" });
  });

  it("drops semifinal losers into the third-place match", () => {
    const results: KOResult[] = [
      { matchId: "SF-1", winnerTeamId: "1A", loserTeamId: "1B" },
      { matchId: "SF-2", winnerTeamId: "1C", loserTeamId: "1D" },
    ];
    const slots = advanceActualBracket(results);
    expect(slots.get("F-1")).toEqual({ homeTeamId: "1A", awayTeamId: "1C" });
    expect(slots.get("3RD-1")).toEqual({ homeTeamId: "1B", awayTeamId: "1D" });
  });

  it("ignores results for matches with no winner yet", () => {
    const slots = advanceActualBracket([]);
    expect(slots.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/advance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/bracket/advance.ts`**

```typescript
import { KNOCKOUT_BY_ID } from "@/lib/bracket/structure";

export interface KOResult {
  matchId: string;
  winnerTeamId: string;
  loserTeamId: string;
}

export interface SlotFill {
  homeTeamId?: string;
  awayTeamId?: string;
}

/**
 * Given finalized knockout results, compute which teams occupy each downstream
 * slot (R16 from R32 winners, … final from SF winners, third-place from SF losers).
 * Returns only slots that have at least one team filled.
 */
export function advanceActualBracket(results: KOResult[]): Map<string, SlotFill> {
  const slots = new Map<string, SlotFill>();
  const put = (matchId: string, side: "home" | "away", teamId: string) => {
    const cur = slots.get(matchId) ?? {};
    if (side === "home") cur.homeTeamId = teamId;
    else cur.awayTeamId = teamId;
    slots.set(matchId, cur);
  };

  for (const r of results) {
    const m = KNOCKOUT_BY_ID.get(r.matchId);
    if (!m) continue;
    if (m.winnerTo) put(m.winnerTo.matchId, m.winnerTo.side, r.winnerTeamId);
    if (m.loserTo) put(m.loserTo.matchId, m.loserTo.side, r.loserTeamId);
  }
  return slots;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/advance.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/advance.ts lib/bracket/advance.test.ts
git commit -m "feat(bracket): advanceActualBracket — winners/losers into later slots (TDD)"
```

---

## Task 4: Knockout scoring (pure, TDD)

Set-by-round model: for each round, points = |user's predicted advancers ∩ actual advancers| × round points; champion is the final winner. Plus the best-third bonus (user's predicted best-8 thirds ∩ actual best-8 thirds × qualThird). Robust to each user's bracket diverging from reality.

**Files:**
- Create: `lib/scoring/knockoutScore.ts`, `lib/scoring/knockoutScore.test.ts`

- [ ] **Step 1: Write the failing test `lib/scoring/knockoutScore.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { scoreUserKnockout } from "@/lib/scoring/knockoutScore";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";

const cfg = DEFAULT_SCORING_CONFIG;

describe("scoreUserKnockout", () => {
  it("awards round points for each correctly predicted advancer", () => {
    // Actual R32 winners: A,B,C,D. User predicted A,B,X,Y to win their R32 ties.
    const actualWinnersByStage = { r32: ["A", "B", "C", "D"], r16: [], qf: [], sf: [], final: [] };
    const predictedWinnersByStage = { r32: ["A", "B", "X", "Y"], r16: [], qf: [], sf: [], final: [] };
    const { points } = scoreUserKnockout({ predictedWinnersByStage, actualWinnersByStage, predictedThirds: [], actualThirds: [], config: cfg });
    expect(points).toBe(2 * cfg.ko.r32); // 2 correct R32 advancers
  });

  it("awards the champion bonus only for the correct final winner", () => {
    const right = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    }).points;
    const wrong = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["B"] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    }).points;
    expect(right).toBe(cfg.ko.champion);
    expect(wrong).toBe(0);
  });

  it("awards the best-third bonus per correctly predicted qualifying third", () => {
    const { points } = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      predictedThirds: ["T0", "T1", "X"],
      actualThirds: ["T0", "T1", "T2"],
      config: cfg,
    });
    expect(points).toBe(2 * cfg.qualThird); // T0, T1 correct
  });

  it("sums all stages", () => {
    const { points } = scoreUserKnockout({
      predictedWinnersByStage: { r32: ["A"], r16: ["A"], qf: ["A"], sf: ["A"], final: ["A"] },
      actualWinnersByStage: { r32: ["A"], r16: ["A"], qf: ["A"], sf: ["A"], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    });
    expect(points).toBe(cfg.ko.r32 + cfg.ko.r16 + cfg.ko.qf + cfg.ko.sf + cfg.ko.champion);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/scoring/knockoutScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/scoring/knockoutScore.ts`**

```typescript
import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface StageSets {
  r32: string[];
  r16: string[];
  qf: string[];
  sf: string[];
  final: string[]; // the champion (final winner)
}

export interface KnockoutScoreInput {
  predictedWinnersByStage: StageSets;
  actualWinnersByStage: StageSets;
  predictedThirds: string[]; // user's predicted best-8 third-place teams
  actualThirds: string[];    // actual best-8 third-place teams
  config: LeagueScoringConfig;
}

function intersectionCount(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length;
}

/**
 * Score one user's knockout stage. Per round, award round points for each team
 * the user correctly had advancing (set intersection — robust to bracket
 * divergence). The "final" set is the champion. Plus best-third bonus.
 */
export function scoreUserKnockout(input: KnockoutScoreInput): { points: number } {
  const { predictedWinnersByStage: p, actualWinnersByStage: a, config } = input;
  let points = 0;
  points += intersectionCount(p.r32, a.r32) * config.ko.r32;
  points += intersectionCount(p.r16, a.r16) * config.ko.r16;
  points += intersectionCount(p.qf, a.qf) * config.ko.qf;
  points += intersectionCount(p.sf, a.sf) * config.ko.sf;
  points += intersectionCount(p.final, a.final) * config.ko.champion;
  points += intersectionCount(input.predictedThirds, input.actualThirds) * config.qualThird;
  return { points };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/scoring/knockoutScore.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/scoring/knockoutScore.ts lib/scoring/knockoutScore.test.ts
git commit -m "feat(scoring): knockout scoring (per-round advancers + champion + best-third, TDD)"
```

---

## Task 5: Seed the 32 knockout match rows

**Files:**
- Modify: `scripts/seed.ts`

- [ ] **Step 1: Add a knockout seed block to `scripts/seed.ts`**

After the existing group-match upsert (and before the final `console.log`/return), add:

```typescript
  // 3. Knockout match rows (teams resolved later by the bracket service).
  const { KNOCKOUT_MATCHES } = await import("../lib/bracket/structure");
  // Knockout kicks off after the group stage (purely indicative fixture timing).
  const KO_START = Date.UTC(2026, 5, 28, 18, 0, 0);
  const koRows = KNOCKOUT_MATCHES.map((m, i) => {
    const kickoff = new Date(KO_START + i * 6 * 60 * 60 * 1000).toISOString();
    return {
      id: m.id,
      stage: m.stage,
      group_label: null,
      bracket_slot: m.id,
      home_team_id: null,
      away_team_id: null,
      kickoff_at: kickoff,
      lock_at: kickoff,
      status: "scheduled" as const,
    };
  });
  const { error: koErr } = await admin.from("matches").upsert(koRows, { onConflict: "id" });
  if (koErr) throw koErr;
  console.log(`Upserted ${koRows.length} knockout matches`);
```

- [ ] **Step 2: Run seed + verify**

Run:
```bash
cd /Users/vaamx/worldcup2026 && npm run seed
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select stage, count(*) from public.matches group by stage order by stage;"
```
Expected: prints "Upserted 32 knockout matches"; counts: group 72, r32 16, r16 8, qf 4, sf 2, final 1, third 1.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add scripts/seed.ts
git commit -m "feat(bracket): seed the 32 knockout match rows"
```

---

## Task 6: Resolution + knockout scoring in the service

**Files:**
- Modify: `lib/scoring/run.ts`

- [ ] **Step 1: Add `resolveAndAdvance` and extend `runScoring` in `lib/scoring/run.ts`**

Add these imports at the top:
```typescript
import { computeQualifiers, resolveR32 } from "@/lib/bracket/resolve";
import { advanceActualBracket, type KOResult } from "@/lib/bracket/advance";
import { scoreUserKnockout, type StageSets } from "@/lib/scoring/knockoutScore";
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";
import { rankThirdPlaceTeams, computeGroupStandings } from "@/lib/math";
```

Add this exported function:
```typescript
/**
 * Resolve R32 once all group matches are final, and advance actual winners into
 * later slots as knockout matches finalize. Idempotent (only writes empty slots).
 */
export async function resolveAndAdvance(admin: SupabaseClient): Promise<{ r32Resolved: boolean; advanced: number }> {
  const [{ data: matches, error: mErr }, { data: teams, error: tErr }] = await Promise.all([
    admin.from("matches").select("id, stage, group_label, home_team_id, away_team_id, home_score, away_score, status, winner_team_id"),
    admin.from("teams").select("id, group_label, fifa_rank"),
  ]);
  if (mErr) throw mErr;
  if (tErr) throw tErr;

  const group = (matches ?? []).filter((m) => m.stage === "group");
  const groupsFinal = group.length > 0 && group.every((m) => m.status === "final");

  // 1. Resolve R32 from group results (only if all groups done and R32 still empty).
  let r32Resolved = false;
  const r32Rows = (matches ?? []).filter((m) => m.stage === "r32");
  const r32Empty = r32Rows.some((m) => !m.home_team_id || !m.away_team_id);
  if (groupsFinal && r32Empty) {
    const q = computeQualifiers(
      group.map((m) => ({
        group: m.group_label as string,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        homeScore: m.home_score as number,
        awayScore: m.away_score as number,
      })),
      (teams ?? []).map((t) => ({ id: t.id, group: t.group_label as string, fifaRank: t.fifa_rank ?? 999 }))
    );
    const ties = resolveR32(q);
    for (const [matchId, tie] of ties) {
      const { error } = await admin
        .from("matches")
        .update({ home_team_id: tie.homeTeamId, away_team_id: tie.awayTeamId })
        .eq("id", matchId);
      if (error) throw error;
    }
    r32Resolved = true;
  }

  // 2. Advance actual winners/losers from finalized KO matches into later slots.
  const koFinal: KOResult[] = (matches ?? [])
    .filter((m) => m.stage !== "group" && m.status === "final" && m.winner_team_id)
    .map((m) => ({
      matchId: m.id,
      winnerTeamId: m.winner_team_id as string,
      loserTeamId: m.winner_team_id === m.home_team_id ? (m.away_team_id as string) : (m.home_team_id as string),
    }));
  const slots = advanceActualBracket(koFinal);
  let advanced = 0;
  for (const [matchId, fill] of slots) {
    const patch: Record<string, string> = {};
    if (fill.homeTeamId) patch.home_team_id = fill.homeTeamId;
    if (fill.awayTeamId) patch.away_team_id = fill.awayTeamId;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("matches").update(patch).eq("id", matchId);
    if (error) throw error;
    advanced++;
  }

  return { r32Resolved, advanced };
}
```

- [ ] **Step 2: Extend `runScoring` to add knockout points**

Inside `runScoring`, after loading `matchesRes` (which is currently `.eq("stage", "group")`), add a second load of ALL matches for knockout actuals, and a knockout-predictions load. Then, in the per-user scoring, add `scoreUserKnockout`. Concretely:

a) Add these loads to the initial `Promise.all` array (alongside the existing ones):
```typescript
    admin.from("matches").select("id, stage, home_team_id, away_team_id, winner_team_id, status"),
    admin.from("predictions").select("user_id, match_id, predicted_winner_team_id"),
```
Name them `koMatchesRes` and `koPredsRes`; add both to the `for (const r of [...])` error check.

b) After the existing `teams`/`matches`/`predsByUser` setup, build the knockout actuals + a helper:
```typescript
  // Knockout actual advancers per stage (winners), and best-8 actual thirds.
  const koMatches = koMatchesRes.data ?? [];
  const actualWinnersByStage = stageSetsFromWinners(koMatches);
  const actualThirds = bestThirdIds(matches, teams); // matches here = group matches already loaded

  // Knockout predictions by user: predicted winner per KO match id.
  const koPredsByUser = new Map<string, Map<string, string>>();
  for (const p of koPredsRes.data ?? []) {
    if (!p.predicted_winner_team_id) continue;
    const m = koPredsByUser.get(p.user_id) ?? new Map<string, string>();
    m.set(p.match_id, p.predicted_winner_team_id);
    koPredsByUser.set(p.user_id, m);
  }
```

c) In the per-member scoring loop, add knockout points to each user's total:
```typescript
      const group = scoreUserGroupStage(predsByUser.get(userId) ?? [], matches, teams, config);
      const ko = scoreUserKnockout({
        predictedWinnersByStage: stageSetsFromPicks(koPredsByUser.get(userId) ?? new Map()),
        actualWinnersByStage: actualWinnersByStage,
        predictedThirds: predictedThirdIds(predsByUser.get(userId) ?? [], matches, teams),
        actualThirds,
        config,
      });
      return { league_id: leagueId, user_id: userId, points: group.points + ko.points, exact_count: group.exactCount };
```
(Replace the existing single `scoreUserGroupStage(...)` destructure accordingly.)

d) Add these module-level helpers at the bottom of the file:
```typescript
/** Map a stage string to the StageSets key (third-place playoff doesn't score). */
function stageKey(stage: string): keyof StageSets | null {
  if (stage === "r32" || stage === "r16" || stage === "qf" || stage === "sf" || stage === "final") return stage;
  return null;
}

/** Actual winners grouped by stage from finalized KO match rows. */
function stageSetsFromWinners(koMatches: Array<{ id: string; stage: string; winner_team_id: string | null; status: string }>): StageSets {
  const out: StageSets = { r32: [], r16: [], qf: [], sf: [], final: [] };
  for (const m of koMatches) {
    const k = stageKey(m.stage);
    if (k && m.status === "final" && m.winner_team_id) out[k].push(m.winner_team_id);
  }
  return out;
}

/** A user's predicted winners grouped by stage, from their KO winner picks. */
function stageSetsFromPicks(picks: Map<string, string>): StageSets {
  const out: StageSets = { r32: [], r16: [], qf: [], sf: [], final: [] };
  for (const m of KNOCKOUT_MATCHES) {
    const k = stageKey(m.stage);
    const pick = picks.get(m.id);
    if (k && pick) out[k].push(pick);
  }
  return out;
}

/** Best-8 actual thirds from final group results. */
function bestThirdIds(groupMatches: ScoringMatch[], teams: ScoringTeam[]): string[] {
  const groups = [...new Set(teams.map((t) => t.group_label).filter(Boolean))] as string[];
  const thirdRows = [];
  for (const g of groups) {
    const gm = groupMatches.filter((m) => m.group_label === g && m.status === "final" && m.home_score !== null);
    if (gm.length === 0) continue;
    const gt = teams.filter((t) => t.group_label === g);
    if (gm.length !== gt.length * (gt.length - 1) / 2) continue; // group not complete
    const table = computeGroupStandings(
      gm.map((m) => ({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score as number, awayScore: m.away_score as number })),
      { fifaRank: Object.fromEntries(gt.map((t) => [t.id, t.fifaRank])) }
    );
    if (table[2]) thirdRows.push(table[2]);
  }
  return rankThirdPlaceTeams(thirdRows, 8).map((r) => r.teamId);
}

/** A user's predicted best-8 thirds from their group predictions. */
function predictedThirdIds(predictions: ScoringPrediction[], groupMatches: ScoringMatch[], teams: ScoringTeam[]): string[] {
  // Reuse predictedStandings per group to get each predicted 3rd, then rank.
  // (Imported helper — see import note in Step 3.)
  return predictedBestThirds(predictions, groupMatches, teams);
}
```

> Implementation note: `predictedBestThirds` is added in Step 3 to keep `run.ts` tidy. `ScoringMatch`/`ScoringPrediction`/`ScoringTeam` are already imported in `run.ts`.

- [ ] **Step 3: Add `predictedBestThirds` to `lib/scoring/groupScore.ts` and export it**

```typescript
import { rankThirdPlaceTeams } from "@/lib/math";

/** A user's predicted best-8 third-place teams (from their group predictions). */
export function predictedBestThirds(
  predictions: ScoringPrediction[],
  matches: ScoringMatch[],
  teams: ScoringTeam[]
): string[] {
  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));
  const groups = [...new Set(teams.map((t) => t.group_label).filter(Boolean))] as string[];
  const thirdRows = [];
  for (const g of groups) {
    const groupTeams = teams.filter((t) => t.group_label === g);
    const groupMatches = matches.filter((m) => m.group_label === g);
    const table = predictedStandings(
      groupTeams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
      groupMatches.map((m) => {
        const p = predByMatch.get(m.id);
        return { home_team_id: m.home_team_id, away_team_id: m.away_team_id, predicted_home: p?.predicted_home ?? null, predicted_away: p?.predicted_away ?? null };
      })
    );
    if (table[2]) thirdRows.push(table[2]);
  }
  return rankThirdPlaceTeams(thirdRows, 8).map((r) => r.teamId);
}
```
Then import it in `run.ts`: `import { scoreUserGroupStage, predictedBestThirds } from "@/lib/scoring/groupScore";`

- [ ] **Step 4: Wire `resolveAndAdvance` into the simulate script + cron route**

In `scripts/simulate.ts`, after `applyResults` and before `runScoring`, call:
```typescript
  const { resolveAndAdvance } = await import("../lib/scoring/run");
  const r = await resolveAndAdvance(admin);
  console.log(`Bracket: R32 resolved=${r.r32Resolved}, advanced ${r.advanced} slots`);
```
In `app/api/cron/poll-results/route.ts`, after `applyResults` and before `runScoring`, add `await resolveAndAdvance(admin);` (import it from `@/lib/scoring/run`).

- [ ] **Step 5: Type-check + unit**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit && npm test`
Expected: 0 type errors; all unit tests pass (prior 47 + structure 4 + resolve 2 + advance 3 + knockoutScore 4 = 60).

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/scoring/run.ts lib/scoring/groupScore.ts scripts/simulate.ts app/api/cron/poll-results/route.ts
git commit -m "feat(scoring): resolveAndAdvance + knockout points in runScoring"
```

---

## Task 7: Integration test + final verification

**Files:**
- Create: `lib/bracket/bracket.itest.ts`

- [ ] **Step 1: Write `lib/bracket/bracket.itest.ts`**

Simulates the full group stage, runs `resolveAndAdvance`, and asserts the R32 rows get real teams (proving group→R32 resolution end-to-end against the live DB).

```typescript
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
```

- [ ] **Step 2: Run integration (live stack)**

Run: `cd /Users/vaamx/worldcup2026 && npm run seed && npm run test:integration`
Expected: prior suites + this one pass. (Run `npm run seed` first so the KO rows exist. If `AuthRetryableFetchError`, `npx supabase stop && start`, wait for health 200, retry.)

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/bracket.itest.ts
git commit -m "test(bracket): integration — group results resolve the R32"
```

- [ ] **Step 4: Final gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                 # 60 unit
npm run test:integration # prior + bracket resolution
npm run build            # success
npx tsc --noEmit         # 0 errors
npm run seed && npm run simulate   # end-to-end: groups + KO resolve/advance + score
git status --short       # clean
```

---

## Self-Review Notes (author)

- **Spec coverage:** `resolveBracket` (deferred from Plan 1) → Tasks 1–2; full-bracket KO scoring 10/15/25/40/60 → Task 4; the best-third-place bonus (deferred from Plan 4) → Task 4 + run.ts integration; real-qualifier resolution + actual advancement → Tasks 3, 6; KO match data → Task 5. The interactive bracket UI is **Plan 6** (next), polish **Plan 7**.
- **Reuse:** qualifier/third logic reuses `computeGroupStandings` + `rankThirdPlaceTeams`; KO scoring is a thin set-intersection over existing config; `predictedBestThirds` reuses `predictedStandings`. No duplicated standings math.
- **Robust scoring model:** set-by-round intersection (predicted advancers ∩ actual advancers) is correct even though each user's bracket diverges from reality after R32 — it rewards "which teams you got to each round," matching the spec's per-advancer point table.
- **Deferred-by-design (NOT gaps):** the official FIFA third-place→slot **combination table** (house deterministic assignment used instead — swappable in `structure.ts`/`resolve.ts`); same-group R32 avoidance (irrelevant on synthetic data); exact-KO-scoreline bonus (KO picks are winner-only); the bracket UI (Plan 6); `streak` (Plan 7).
- **Idempotency/safety:** `resolveAndAdvance` only fills empty R32 slots and re-derives advancement from finalized results each run (safe under repeated cron/simulate). All writes go through the injected service-role client (Node-safe; no `server-only` import).
- **Type/name consistency:** `StageSets` keys (`r32/r16/qf/sf/final`) match between `knockoutScore.ts`, its test, and `run.ts` helpers; `Qualifiers`/`resolveR32` signatures match between Task 2 and `run.ts`; `KOResult` matches between Task 3 and `run.ts`; `KNOCKOUT_MATCHES`/`stageMatchIds` from `structure.ts` used consistently.
```
