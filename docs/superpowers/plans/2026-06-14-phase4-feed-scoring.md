# Phase 1 — Plan 4: Results Feed & Scoring Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When real match results land, grade everyone's group-stage predictions and update a **live leaderboard** in real time.

**Architecture:** A pure, tested scoring engine grades a user's group predictions (match points 5/3/2/0 + per-group winner & qualifier bonuses) against final results. A service-role "scoring run" recomputes `league_standings` for every league member (idempotent, recompute-from-scratch) and assigns ranks. Results enter the system two ways: a **dev simulate script** (the locally-exercised path) and a **Vercel Cron route** that pulls from a swappable results **provider** (a real football-data.org adapter, unit-tested for parsing). `league_standings` is added to the Supabase Realtime publication so a leaderboard screen updates live.

**Tech Stack:** TypeScript, the existing `lib/math` module, Supabase service-role client (writes bypass RLS for results/standings), Supabase Realtime, Next.js 16 route handler (cron), Vitest (unit + integration), `tsx` (scripts).

**Scope note:** Group-stage scoring only. **Knockout scoring** (KO round points) and the **best-third-place bonus** are deferred to **Plan 5** (they depend on the bracket / cross-group qualifier resolution built there). The `ScoringConfig.ko` values already exist in the DB default, unused until then.

---

## File Structure

```
lib/scoring/types.ts                          # LeagueScoringConfig + engine I/O types + parser
lib/scoring/groupScore.ts   + .test.ts         # pure: score one user's group stage (TDD)
lib/scoring/run.ts                             # service-role: applyResults + runScoring + ranks
lib/feed/provider.ts                           # ResultsProvider interface + NormalizedResult
lib/feed/footballData.ts    + .test.ts         # real football-data.org adapter (parse tested vs sample)
lib/feed/sample-football-data.json             # captured sample payload for the parser test
scripts/simulate.ts                            # npm run simulate: set final scores + run scoring
app/api/cron/poll-results/route.ts             # Vercel Cron: provider -> applyResults -> runScoring
vercel.json                                    # cron schedule
supabase/migrations/0004_realtime_standings.sql # add league_standings + matches to realtime publication
lib/leaderboard/queries.ts                     # standings + member names for a league
app/(app)/leagues/[id]/page.tsx                # league leaderboard (server load)
app/(app)/leagues/[id]/leaderboard-client.tsx  # client: realtime subscription + animated rows
.env.local.example                             # + FOOTBALL_DATA_API_KEY, CRON_SECRET
package.json                                   # + "simulate" script
```

---

## Task 1: Scoring types + config parser

**Files:**
- Create: `lib/scoring/types.ts`

- [ ] **Step 1: Write `lib/scoring/types.ts`**

```typescript
/** Full per-league scoring config (mirrors leagues.scoring_config JSON). */
export interface LeagueScoringConfig {
  exact: number;
  goalDiff: number;
  outcome: number;
  qualWinner: number;
  qualTop2: number;
  qualThird: number;
  ko: { r32: number; r16: number; qf: number; sf: number; champion: number; exactBonus: number };
}

export const DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  exact: 5,
  goalDiff: 3,
  outcome: 2,
  qualWinner: 3,
  qualTop2: 2,
  qualThird: 2,
  ko: { r32: 10, r16: 15, qf: 25, sf: 40, champion: 60, exactBonus: 3 },
};

/** Parse a raw JSON scoring_config, falling back to defaults for any missing field. */
export function parseScoringConfig(raw: unknown): LeagueScoringConfig {
  const c = (raw ?? {}) as Partial<LeagueScoringConfig> & { ko?: Partial<LeagueScoringConfig["ko"]> };
  const d = DEFAULT_SCORING_CONFIG;
  return {
    exact: c.exact ?? d.exact,
    goalDiff: c.goalDiff ?? d.goalDiff,
    outcome: c.outcome ?? d.outcome,
    qualWinner: c.qualWinner ?? d.qualWinner,
    qualTop2: c.qualTop2 ?? d.qualTop2,
    qualThird: c.qualThird ?? d.qualThird,
    ko: { ...d.ko, ...(c.ko ?? {}) },
  };
}

/** A finalized (or pending) match as seen by the scoring engine. */
export interface ScoringMatch {
  id: string;
  group_label: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "final";
}

/** One user's predicted scoreline for a match. */
export interface ScoringPrediction {
  match_id: string;
  predicted_home: number | null;
  predicted_away: number | null;
}

/** Team reference for tiebreaks. */
export interface ScoringTeam {
  id: string;
  group_label: string | null;
  fifaRank: number;
}

export interface GroupScoreResult {
  points: number;
  exactCount: number;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/vaamx/worldcup2026
npx tsc --noEmit
git add lib/scoring/types.ts
git commit -m "feat(scoring): scoring config types + parser"
```

---

## Task 2: Group-stage scoring engine (pure, TDD)

**Files:**
- Create: `lib/scoring/groupScore.ts`, `lib/scoring/groupScore.test.ts`

- [ ] **Step 1: Write the failing test `lib/scoring/groupScore.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { scoreUserGroupStage } from "@/lib/scoring/groupScore";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";
import type { ScoringMatch, ScoringPrediction, ScoringTeam } from "@/lib/scoring/types";

const cfg = DEFAULT_SCORING_CONFIG;

const teams: ScoringTeam[] = [
  { id: "A", group_label: "X", fifaRank: 1 },
  { id: "B", group_label: "X", fifaRank: 2 },
  { id: "C", group_label: "X", fifaRank: 3 },
  { id: "D", group_label: "X", fifaRank: 4 },
];

// Full group X (6 matches). Actual outcome makes A win the group, B second.
function groupX(allFinal: boolean): ScoringMatch[] {
  const m = (id: string, h: string, a: string, hs: number | null, as: number | null): ScoringMatch => ({
    id, group_label: "X", home_team_id: h, away_team_id: a,
    home_score: allFinal ? hs : null, away_score: allFinal ? as : null,
    status: allFinal ? "final" : "scheduled",
  });
  return [
    m("X1", "A", "B", 1, 0),
    m("X2", "C", "D", 2, 2),
    m("X3", "A", "C", 3, 0),
    m("X4", "B", "D", 1, 0),
    m("X5", "A", "D", 2, 1),
    m("X6", "B", "C", 2, 1),
  ];
}

describe("scoreUserGroupStage", () => {
  it("awards match points only for final matches the user predicted", () => {
    const matches = groupX(true);
    const preds: ScoringPrediction[] = [
      { match_id: "X1", predicted_home: 1, predicted_away: 0 }, // exact -> 5
      { match_id: "X2", predicted_home: 1, predicted_away: 1 }, // right result (draw), wrong score -> 2
      { match_id: "X3", predicted_home: 2, predicted_away: 0 }, // right result + right GD? actual 3-0 GD3, pred 2-0 GD2 -> outcome only 2
    ];
    const { points } = scoreUserGroupStage(preds, matches, teams, cfg);
    // 5 + 2 + 2 = 9 match points, plus group-complete bonuses (predicted winner A? only partial preds)
    expect(points).toBeGreaterThanOrEqual(9);
  });

  it("counts exact scorelines", () => {
    const matches = groupX(true);
    const preds: ScoringPrediction[] = [
      { match_id: "X1", predicted_home: 1, predicted_away: 0 },
      { match_id: "X5", predicted_home: 2, predicted_away: 1 },
    ];
    const { exactCount } = scoreUserGroupStage(preds, matches, teams, cfg);
    expect(exactCount).toBe(2);
  });

  it("does not score unfinished matches", () => {
    const matches = groupX(false); // none final
    const preds: ScoringPrediction[] = [{ match_id: "X1", predicted_home: 1, predicted_away: 0 }];
    expect(scoreUserGroupStage(preds, matches, teams, cfg).points).toBe(0);
  });

  it("awards the winner bonus when the predicted group winner is correct", () => {
    const matches = groupX(true); // actual winner: A (3 wins)
    // Predict every match so the predicted table is complete; predict A to win all.
    const preds: ScoringPrediction[] = matches.map((m) => ({
      match_id: m.id,
      predicted_home: m.home_team_id === "A" ? 1 : 0,
      predicted_away: m.away_team_id === "A" ? 1 : 0,
    }));
    // Compare against a baseline where the user predicts the exact opposite winner.
    const withA = scoreUserGroupStage(preds, matches, teams, cfg).points;
    const predsWrong: ScoringPrediction[] = matches.map((m) => ({
      match_id: m.id,
      predicted_home: m.home_team_id === "D" ? 1 : 0,
      predicted_away: m.away_team_id === "D" ? 1 : 0,
    }));
    const withD = scoreUserGroupStage(predsWrong, matches, teams, cfg).points;
    expect(withA).toBeGreaterThan(withD); // correct-winner bonus contributes
  });

  it("awards qualifier bonus for each correct top-2 team", () => {
    const matches = groupX(true); // actual top 2: A, B
    // User predicts A and B as top 2 (predict them winning their matches).
    const preds: ScoringPrediction[] = matches.map((m) => {
      const fav = (t: string) => t === "A" || t === "B";
      return {
        match_id: m.id,
        predicted_home: fav(m.home_team_id) && !fav(m.away_team_id) ? 1 : 0,
        predicted_away: fav(m.away_team_id) && !fav(m.home_team_id) ? 1 : 0,
      };
    });
    const res = scoreUserGroupStage(preds, matches, teams, cfg);
    // Should include 2x qualTop2 (=4) on top of match points + winner bonus.
    const noBonus = scoreUserGroupStage(
      preds,
      matches.map((m) => ({ ...m, status: "scheduled", home_score: null, away_score: null })),
      teams,
      cfg
    );
    expect(res.points - noBonus.points).toBeGreaterThanOrEqual(cfg.qualTop2 * 2);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/scoring/groupScore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/scoring/groupScore.ts`**

```typescript
import { scorePrediction, computeGroupStandings } from "@/lib/math";
import { predictedStandings } from "@/lib/predictions/toStandings";
import type {
  LeagueScoringConfig,
  ScoringMatch,
  ScoringPrediction,
  ScoringTeam,
  GroupScoreResult,
} from "@/lib/scoring/types";

function isFinal(m: ScoringMatch): boolean {
  return m.status === "final" && m.home_score !== null && m.away_score !== null;
}

/**
 * Score one user's GROUP STAGE: per-match points (5/3/2/0) for final matches they
 * predicted, plus per-completed-group bonuses (correct winner, each correct top-2
 * qualifier). Pure and idempotent — safe to recompute from scratch.
 */
export function scoreUserGroupStage(
  predictions: ScoringPrediction[],
  matches: ScoringMatch[],
  teams: ScoringTeam[],
  config: LeagueScoringConfig
): GroupScoreResult {
  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));
  let points = 0;
  let exactCount = 0;

  // 1. Per-match points.
  for (const m of matches) {
    if (!isFinal(m)) continue;
    const p = predByMatch.get(m.id);
    if (!p || p.predicted_home === null || p.predicted_away === null) continue;
    points += scorePrediction(
      { home: p.predicted_home, away: p.predicted_away },
      { home: m.home_score as number, away: m.away_score as number },
      { exact: config.exact, goalDiff: config.goalDiff, outcome: config.outcome }
    );
    if (p.predicted_home === m.home_score && p.predicted_away === m.away_score) exactCount++;
  }

  // 2. Per-completed-group qualification bonuses.
  const groupLabels = [...new Set(teams.map((t) => t.group_label).filter(Boolean))] as string[];
  for (const g of groupLabels) {
    const groupMatches = matches.filter((m) => m.group_label === g);
    if (groupMatches.length === 0 || !groupMatches.every(isFinal)) continue;
    const groupTeams = teams.filter((t) => t.group_label === g);
    const fifaRank = Object.fromEntries(groupTeams.map((t) => [t.id, t.fifaRank]));

    const actual = computeGroupStandings(
      groupMatches.map((m) => ({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: m.home_score as number,
        awayScore: m.away_score as number,
      })),
      { fifaRank }
    );

    const predicted = predictedStandings(
      groupTeams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
      groupMatches.map((m) => {
        const p = predByMatch.get(m.id);
        return {
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
          predicted_home: p?.predicted_home ?? null,
          predicted_away: p?.predicted_away ?? null,
        };
      })
    );

    if (actual[0] && predicted[0] && actual[0].teamId === predicted[0].teamId) {
      points += config.qualWinner;
    }
    const predTop2 = new Set(predicted.slice(0, 2).map((r) => r.teamId));
    for (const r of actual.slice(0, 2)) {
      if (predTop2.has(r.teamId)) points += config.qualTop2;
    }
  }

  return { points, exactCount };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/scoring/groupScore.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/scoring/groupScore.ts lib/scoring/groupScore.test.ts
git commit -m "feat(scoring): group-stage scoring engine (match points + qualifier bonuses, TDD)"
```

---

## Task 3: Scoring run + apply-results service (service-role)

**Files:**
- Create: `lib/scoring/run.ts`

- [ ] **Step 1: Write `lib/scoring/run.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreUserGroupStage } from "@/lib/scoring/groupScore";
import { parseScoringConfig } from "@/lib/scoring/types";
import type { ScoringMatch, ScoringPrediction, ScoringTeam } from "@/lib/scoring/types";
import { outcomeOf } from "@/lib/math";

export interface NormalizedResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

// NOTE: these take an injected service-role client rather than importing the
// `server-only` admin module, so they can also run from Node scripts/tests
// (the simulate script and the integration test). Callers in server runtime
// pass `createAdminClient()`; scripts/tests pass their own service-role client.

/** Write final results to matches (status=final, winner). Caller passes a service-role client. */
export async function applyResults(admin: SupabaseClient, results: NormalizedResult[]): Promise<number> {
  if (results.length === 0) return 0;
  // Need the team ids to resolve a winner; fetch the affected matches.
  const ids = results.map((r) => r.matchId);
  const { data: rows, error } = await admin
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((rows ?? []).map((m) => [m.id, m]));

  let applied = 0;
  for (const r of results) {
    const m = byId.get(r.matchId);
    if (!m) continue; // unknown match id — skip
    const o = outcomeOf(r.homeScore, r.awayScore);
    const winner = o === "home" ? m.home_team_id : o === "away" ? m.away_team_id : null;
    const { error: upErr } = await admin
      .from("matches")
      .update({ home_score: r.homeScore, away_score: r.awayScore, status: "final", winner_team_id: winner })
      .eq("id", r.matchId);
    if (upErr) throw upErr;
    applied++;
  }
  return applied;
}

/**
 * Recompute league_standings for every member of every league from scratch
 * (idempotent). Updates points, exact_count, and rank. Service-role only.
 */
export async function runScoring(admin: SupabaseClient): Promise<{ leagues: number; rows: number }> {
  const [teamsRes, matchesRes, predsRes, leaguesRes, membersRes] = await Promise.all([
    admin.from("teams").select("id, group_label, fifa_rank"),
    admin.from("matches").select("id, group_label, home_team_id, away_team_id, home_score, away_score, status").eq("stage", "group"),
    admin.from("predictions").select("user_id, match_id, predicted_home, predicted_away"),
    admin.from("leagues").select("id, scoring_config"),
    admin.from("league_members").select("league_id, user_id"),
  ]);
  for (const r of [teamsRes, matchesRes, predsRes, leaguesRes, membersRes]) {
    if (r.error) throw r.error;
  }

  const teams: ScoringTeam[] = (teamsRes.data ?? []).map((t) => ({
    id: t.id, group_label: t.group_label, fifaRank: t.fifa_rank ?? 999,
  }));
  const matches = (matchesRes.data ?? []) as ScoringMatch[];

  const predsByUser = new Map<string, ScoringPrediction[]>();
  for (const p of predsRes.data ?? []) {
    const list = predsByUser.get(p.user_id) ?? [];
    list.push({ match_id: p.match_id, predicted_home: p.predicted_home, predicted_away: p.predicted_away });
    predsByUser.set(p.user_id, list);
  }

  const configByLeague = new Map((leaguesRes.data ?? []).map((l) => [l.id, parseScoringConfig(l.scoring_config)]));
  const membersByLeague = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const list = membersByLeague.get(m.league_id) ?? [];
    list.push(m.user_id);
    membersByLeague.set(m.league_id, list);
  }

  const now = new Date().toISOString();
  let rows = 0;
  for (const [leagueId, userIds] of membersByLeague) {
    const config = configByLeague.get(leagueId);
    if (!config) continue;

    const scored = userIds.map((userId) => {
      const { points, exactCount } = scoreUserGroupStage(
        predsByUser.get(userId) ?? [], matches, teams, config
      );
      return { league_id: leagueId, user_id: userId, points, exact_count: exactCount };
    });

    // Competition ranking: sort by points desc; equal points share a rank.
    scored.sort((a, b) => b.points - a.points);
    const ranked = scored.map((s, i) => ({
      ...s,
      rank: i > 0 && scored[i - 1].points === s.points ? (scoredRank(scored, i)) : i + 1,
      updated_at: now,
    }));

    const { error } = await admin.from("league_standings").upsert(ranked, { onConflict: "league_id,user_id" });
    if (error) throw error;
    rows += ranked.length;
  }

  return { leagues: membersByLeague.size, rows };
}

/** Standard competition rank: first index of this point total + 1. */
function scoredRank(scored: { points: number }[], i: number): number {
  const pts = scored[i].points;
  return scored.findIndex((s) => s.points === pts) + 1;
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/vaamx/worldcup2026
npx tsc --noEmit
git add lib/scoring/run.ts
git commit -m "feat(scoring): service-role applyResults + runScoring with ranks"
```

---

## Task 4: Dev simulate script

**Files:**
- Create: `scripts/simulate.ts`
- Modify: `package.json` (`"simulate"` script)

- [ ] **Step 1: Add the script to `package.json`**

In `"scripts"` add:
```json
"simulate": "tsx scripts/simulate.ts"
```

- [ ] **Step 2: Write `scripts/simulate.ts`**

Sets plausible final scores for group matches (all, or the N passed as `npm run simulate -- 12`), then runs scoring. Uses the service-role client. `Math.random` is fine in a dev script.

```typescript
import { config } from "dotenv";
config({ path: ".env.local" });

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
  const { leagues, rows } = await runScoring(admin);
  console.log(`Scored ${rows} standings rows across ${leagues} leagues`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Run it against the local DB**

Run (stack up, full groups seeded):
```bash
cd /Users/vaamx/worldcup2026
npm run seed            # ensure 12 groups present
npm run simulate -- 6   # play the first 6 group matches
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select count(*) as final from public.matches where status='final'; select count(*) as standings from public.league_standings;"
```
Expected: prints "Applied 6 results" and a scored-rows count; `final` ≥ 6. (standings rows appear only for leagues that have members — likely 0 until a user exists; that's fine, the integration test in Task 7 creates one.)

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add scripts/simulate.ts package.json
git commit -m "feat(scoring): dev simulate script (set results + run scoring)"
```

---

## Task 5: Results provider + football-data.org adapter (parse-tested)

**Files:**
- Create: `lib/feed/provider.ts`, `lib/feed/footballData.ts`, `lib/feed/footballData.test.ts`, `lib/feed/sample-football-data.json`

- [ ] **Step 1: Write `lib/feed/provider.ts`**

```typescript
import type { NormalizedResult } from "@/lib/scoring/run";

/** A swappable source of finished match results, normalized to our match ids. */
export interface ResultsProvider {
  readonly name: string;
  fetchFinishedResults(): Promise<NormalizedResult[]>;
}

export type { NormalizedResult };
```

- [ ] **Step 2: Capture a tiny sample payload `lib/feed/sample-football-data.json`**

A trimmed football-data.org `/matches` response shape (two finished matches):
```json
{
  "matches": [
    {
      "id": 537331,
      "status": "FINISHED",
      "matchday": 1,
      "homeTeam": { "tla": "MEX" },
      "awayTeam": { "tla": "BEL" },
      "score": { "fullTime": { "home": 2, "away": 1 } }
    },
    {
      "id": 537332,
      "status": "SCHEDULED",
      "matchday": 1,
      "homeTeam": { "tla": "SCO" },
      "awayTeam": { "tla": "JOR" },
      "score": { "fullTime": { "home": null, "away": null } }
    }
  ]
}
```

- [ ] **Step 3: Write the failing test `lib/feed/footballData.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { parseFootballDataMatches } from "@/lib/feed/footballData";
import sample from "@/lib/feed/sample-football-data.json";

describe("parseFootballDataMatches", () => {
  it("normalizes only FINISHED matches via the supplied id resolver", () => {
    // resolver maps a provider match to our id by home/away TLA (group A here).
    const resolve = (home: string, away: string) => `GA-${home}-${away}`;
    const out = parseFootballDataMatches(sample, resolve);
    expect(out).toEqual([{ matchId: "GA-MEX-BEL", homeScore: 2, awayScore: 1 }]);
  });

  it("skips matches the resolver can't map (returns null)", () => {
    const out = parseFootballDataMatches(sample, () => null);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 4: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/feed/footballData.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement `lib/feed/footballData.ts`**

```typescript
import type { NormalizedResult, ResultsProvider } from "@/lib/feed/provider";

interface FDMatch {
  status: string;
  homeTeam: { tla: string | null };
  awayTeam: { tla: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
}
interface FDResponse { matches: FDMatch[] }

/** Maps a finished provider match (by team TLAs) to our internal match id, or null. */
export type MatchIdResolver = (homeTla: string, awayTla: string) => string | null;

/** Pure parser: normalize a football-data /matches payload to our result shape. */
export function parseFootballDataMatches(payload: FDResponse, resolve: MatchIdResolver): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const m of payload.matches ?? []) {
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!m.homeTeam?.tla || !m.awayTeam?.tla || ft?.home == null || ft?.away == null) continue;
    const matchId = resolve(m.homeTeam.tla, m.awayTeam.tla);
    if (!matchId) continue;
    out.push({ matchId, homeScore: ft.home, awayScore: ft.away });
  }
  return out;
}

/**
 * Real football-data.org adapter. Requires FOOTBALL_DATA_API_KEY and a resolver
 * mapping provider team TLAs to our internal match ids (wired when real fixtures
 * replace the dev seed). Without a key it yields no results.
 */
export function footballDataProvider(resolve: MatchIdResolver): ResultsProvider {
  return {
    name: "football-data.org",
    async fetchFinishedResults(): Promise<NormalizedResult[]> {
      const key = process.env.FOOTBALL_DATA_API_KEY;
      if (!key) return [];
      const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED", {
        headers: { "X-Auth-Token": key },
      });
      if (!res.ok) throw new Error(`football-data ${res.status}`);
      const payload = (await res.json()) as FDResponse;
      return parseFootballDataMatches(payload, resolve);
    },
  };
}
```

- [ ] **Step 6: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/feed/footballData.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/feed/
git commit -m "feat(feed): results provider interface + football-data adapter (parse TDD)"
```

---

## Task 6: Cron route + env

**Files:**
- Create: `app/api/cron/poll-results/route.ts`, `vercel.json`
- Modify: `.env.local.example`

- [ ] **Step 1: Write `app/api/cron/poll-results/route.ts`**

```typescript
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
  const admin = createAdminClient();
  const provider = footballDataProvider(() => null);
  const results = await provider.fetchFinishedResults();
  const applied = await applyResults(admin, results);
  const scored = applied > 0 ? await runScoring(admin) : { leagues: 0, rows: 0 };
  return NextResponse.json({ provider: provider.name, applied, ...scored });
}
```

- [ ] **Step 2: Write `vercel.json`**

```json
{
  "crons": [
    { "path": "/api/cron/poll-results", "schedule": "*/5 * * * *" }
  ]
}
```

- [ ] **Step 3: Add env to `.env.local.example`**

Append:
```bash
# Results feed (optional in dev — the simulate script drives scoring locally).
FOOTBALL_DATA_API_KEY=
# Shared secret Vercel Cron presents as `Authorization: Bearer <CRON_SECRET>`.
CRON_SECRET=dev-cron-secret
```

- [ ] **Step 4: Verify the route builds + auth-guards**

Run:
```bash
cd /Users/vaamx/worldcup2026
echo "CRON_SECRET=dev-cron-secret" >> .env.local
npm run build
npm run dev >/tmp/cron-dev.log 2>&1 &
DEV=$!; for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -s -o /dev/null -w "no auth: %{http_code}\n" http://localhost:3000/api/cron/poll-results
curl -s -o /dev/null -w "with auth: %{http_code}\n" -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron/poll-results
kill $DEV 2>/dev/null
```
Expected: build succeeds; no-auth → 401; with-auth → 200 (JSON `{applied:0,...}` in dev since the resolver returns null).

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add app/api/cron/poll-results/route.ts vercel.json .env.local.example
git commit -m "feat(feed): Vercel Cron poll route (CRON_SECRET-guarded) + schedule"
```

---

## Task 7: Realtime publication + leaderboard screen

**Files:**
- Create: `supabase/migrations/0004_realtime_standings.sql`, `lib/leaderboard/queries.ts`, `app/(app)/leagues/[id]/page.tsx`, `app/(app)/leagues/[id]/leaderboard-client.tsx`
- Modify: `app/(app)/leagues/page.tsx` (link each league to its leaderboard)

- [ ] **Step 1: Write `supabase/migrations/0004_realtime_standings.sql`**

```sql
-- Stream standings + live match changes to clients via Supabase Realtime.
alter publication supabase_realtime add table public.league_standings;
alter publication supabase_realtime add table public.matches;
```

- [ ] **Step 2: Apply it**

Run: `cd /Users/vaamx/worldcup2026 && npx supabase db reset && npm run seed`
Expected: 0001–0004 apply cleanly; seed restores 48/72.

- [ ] **Step 3: Write `lib/leaderboard/queries.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";

export interface StandingRow {
  userId: string;
  displayName: string;
  points: number;
  rank: number | null;
  exactCount: number;
}

export interface LeagueHeader {
  id: string;
  name: string;
  inviteCode: string;
  isGlobal: boolean;
}

/** The league header + its standings (joined with member display names), top first. */
export async function getLeaderboard(leagueId: string): Promise<{ league: LeagueHeader; rows: StandingRow[] } | null> {
  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues").select("id, name, invite_code, is_global").eq("id", leagueId).single();
  if (!league) return null;

  const { data: standings } = await supabase
    .from("league_standings")
    .select("user_id, points, rank, exact_count, profiles(display_name)")
    .eq("league_id", leagueId)
    .order("points", { ascending: false });

  const rows: StandingRow[] = (standings ?? []).map((s) => ({
    userId: s.user_id,
    displayName: (s.profiles as unknown as { display_name: string | null })?.display_name ?? "Guest",
    points: s.points,
    rank: s.rank,
    exactCount: s.exact_count,
  }));

  return {
    league: { id: league.id, name: league.name, inviteCode: league.invite_code, isGlobal: league.is_global },
    rows,
  };
}
```

- [ ] **Step 4: Write `app/(app)/leagues/[id]/leaderboard-client.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { StandingRow } from "@/lib/leaderboard/queries";

export function LeaderboardClient({ leagueId, initialRows }: { leagueId: string; initialRows: StandingRow[] }) {
  const [rows, setRows] = useState<StandingRow[]>(initialRows);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`standings:${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_standings", filter: `league_id=eq.${leagueId}` },
        async () => {
          // A standings row changed — refetch this league's ordered rows.
          const { data } = await supabase
            .from("league_standings")
            .select("user_id, points, rank, exact_count, profiles(display_name)")
            .eq("league_id", leagueId)
            .order("points", { ascending: false });
          if (data) {
            setRows(
              data.map((s) => ({
                userId: s.user_id,
                displayName: (s.profiles as unknown as { display_name: string | null })?.display_name ?? "Guest",
                points: s.points,
                rank: s.rank,
                exactCount: s.exact_count,
              }))
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-white/50">No scores yet — predictions are graded as results come in.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <motion.li
          key={r.userId}
          layout
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <span className="flex items-center gap-3">
            <span className="w-6 text-center font-extrabold text-[var(--bn-gold)]">{i + 1}</span>
            <span className="font-semibold">{r.displayName}</span>
          </span>
          <span className="flex items-center gap-3 text-sm">
            <span className="text-white/40">{r.exactCount} exact</span>
            <span className="font-black tabular-nums text-[var(--bn-gold)]">{r.points}</span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Write `app/(app)/leagues/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLeaderboard(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/leagues" className="text-sm text-white/50 hover:text-white/80">← Leagues</Link>
        {!data.league.isGlobal && (
          <span className="text-xs text-white/50">Code <span className="font-mono text-[var(--bn-gold)]">{data.league.inviteCode}</span></span>
        )}
      </div>
      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">LEADERBOARD</p>
        <h1 className="text-2xl font-black">{data.league.name}</h1>
      </div>
      <LeaderboardClient leagueId={data.league.id} initialRows={data.rows} />
    </main>
  );
}
```

- [ ] **Step 6: Link each league to its leaderboard in `app/(app)/leagues/page.tsx`**

Wrap each league `Card` in a link. Replace the `leagues.map(...)` block's `<Card ...>...</Card>` with a linked version:
```tsx
        {leagues.map((l) => (
          <Link key={l.id} href={`/leagues/${l.id}`} className="block">
            <Card className="flex items-center justify-between transition-colors hover:bg-white/[0.06]">
              <div>
                <p className="font-bold">{l.name}</p>
                {!l.is_global && (
                  <p className="text-xs text-white/50">Invite code: <span className="font-mono text-[var(--bn-gold)]">{l.invite_code}</span></p>
                )}
              </div>
              <span className="text-white/40">›</span>
            </Card>
          </Link>
        ))}
```
Ensure `Link` is imported at the top of the file (it already is from the Phase-2-optional change).

- [ ] **Step 7: Build + type-check**

Run: `cd /Users/vaamx/worldcup2026 && npm run build && npx tsc --noEmit`
Expected: build succeeds; `/leagues/[id]` route present; 0 type errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/migrations/0004_realtime_standings.sql lib/leaderboard "app/(app)/leagues"
git commit -m "feat(leaderboard): realtime publication + live league leaderboard screen"
```

---

## Task 8: Integration test — results flow into standings

**Files:**
- Create: `lib/scoring/run.itest.ts`

- [ ] **Step 1: Write `lib/scoring/run.itest.ts`**

Creates a user (auto-joined to the global league via the trigger), saves a prediction for a seeded group match, applies a matching result, runs scoring, and asserts the user's global-league standings reflect the points. Runs against the live stack.

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResults, runScoring } from "@/lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GLOBAL = "00000000-0000-0000-0000-000000000001";
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("results → scoring → standings (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;

  beforeAll(async () => {
    const email = `score-${stamp}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    if (error) throw error;
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await client.auth.signInWithPassword({ email, password: "Password123!" });
    user = { id: data.user!.id, client };

    // Reset the seeded match so the test is deterministic regardless of prior sims.
    await admin.from("matches").update({ status: "scheduled", home_score: null, away_score: null, winner_team_id: null }).eq("id", "GA-MEX-BEL");
    // User predicts MEX 2-1 BEL (exact match for the result we'll apply).
    await user.client.from("predictions").upsert(
      { user_id: user.id, match_id: "GA-MEX-BEL", predicted_home: 2, predicted_away: 1 },
      { onConflict: "user_id,match_id" }
    );
  });

  it("grades an exact prediction and writes it to the user's global standings", async () => {
    await applyResults(admin, [{ matchId: "GA-MEX-BEL", homeScore: 2, awayScore: 1 }]);
    await runScoring(admin);

    const { data } = await user.client
      .from("league_standings")
      .select("points, exact_count")
      .eq("league_id", GLOBAL)
      .eq("user_id", user.id)
      .single();

    expect(data?.points).toBeGreaterThanOrEqual(5); // exact scoreline = 5
    expect(data?.exact_count).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run against the live stack**

Run: `cd /Users/vaamx/worldcup2026 && npm run test:integration`
Expected: PASS — prior suites (8) plus this scoring test all pass. (If `AuthRetryableFetchError`, `npx supabase stop && npx supabase start`, wait for health 200, retry.)

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/scoring/run.itest.ts
git commit -m "test(scoring): integration test — results grade into standings"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                 # unit: prior 35 + groupScore (5) + footballData (2) = 42
npm run test:integration # prior 8 + scoring (1) = 9
npm run build            # success; /api/cron/poll-results + /leagues/[id] present
npx tsc --noEmit         # 0 errors
```

- [ ] **Step 2: End-to-end simulate smoke**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm run seed && npm run simulate -- 12
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select status, count(*) from public.matches group by status;"
```
Expected: 12 matches `final`; simulate prints scored rows (≥0 depending on members).

- [ ] **Step 3: Clean tree**

Run: `cd /Users/vaamx/worldcup2026 && git status --short`
Expected: empty.

---

## Self-Review Notes (author)

- **Spec coverage:** scoring model §4 (group 5/3/2/0 + winner/qualifier bonuses) → Tasks 1–2; results feed + provider abstraction §5 → Task 5; cron poll → Task 6; scoring run + standings → Task 3; realtime leaderboard §3/§10 → Task 7; dev result source → Task 4; end-to-end proof → Task 8.
- **Reuse:** the engine composes `scorePrediction`, `computeGroupStandings`, and `predictedStandings` — no duplicated scoring/standings logic. `applyResults` reuses `outcomeOf` to resolve winners.
- **Deferred-by-design (NOT gaps):** knockout-round scoring + the best-third-place bonus (Plan 5 — need the bracket/qualifier resolution); `streak` (Plan 6 gamification) stays 0; real football-data id mapping (lands when real fixtures replace the dev seed — the adapter + resolver hook are ready, parsing is tested).
- **Security:** results + standings are written ONLY by the service-role client (`lib/scoring/run.ts` is `server-only`; RLS has no client write policy on either, verified in Plan 2). The cron route is `CRON_SECRET`-guarded. Realtime only exposes already-readable rows (RLS still applies to Realtime: standings are member-readable).
- **Idempotency:** `runScoring` recomputes from scratch and upserts — safe to run repeatedly (cron + simulate). The integration test resets `GA-MEX-BEL` first so it's deterministic across repeated runs/sims.
- **Type/name consistency:** `NormalizedResult` is defined in `run.ts` and re-exported via `provider.ts`; `parseScoringConfig`/`LeagueScoringConfig` shared by `run.ts` and the engine; `scoreUserGroupStage(predictions, matches, teams, config)` signature matches between Task 2, its test, and `run.ts`.
```
