# Top Scorers & Golden Boot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each user pick 10 players they think will be the World Cup's top scorers and crown one Golden Boot (with a predicted goal tally), scored against the live football-data.org scorers feed and folded into league standings.

**Architecture:** A new `players` table (ingested from the 48 squads) + a `scorer_predictions` table (owner-only). A pure `scoreUserScorers` function plugs into the existing `runScoring`. A `/scorers` tab (5th bottom-nav item) lets users search/add players, star a Golden Boot, and see the live actual Top 10. Picks lock when the Round of 32 begins.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), TypeScript, Vitest, Tailwind v4, football-data.org v4 API, the app's i18n dictionaries.

**Branch:** `feat-top-scorers` (do NOT merge to `main` until the migration is applied to the hosted DB — `main` auto-deploys to prod).

---

## File Structure

- **Create** `supabase/migrations/0006_players_scorers.sql` — `players` + `scorer_predictions` tables, RLS, grants.
- **Modify** `lib/scoring/types.ts` — add `scorer` block to `LeagueScoringConfig` + defaults + parse.
- **Create** `lib/feed/ingestPlayers.ts` — fetch squads → player rows; fetch scorers → goal updates (pure parsers + admin writers).
- **Create** `lib/feed/ingestPlayers.test.ts` — parser unit tests.
- **Create** `scripts/ingest-players.ts` — Node entry to ingest squads (mirrors `scripts/ingest-wc.ts`).
- **Create** `lib/scoring/scorerScore.ts` — pure `scoreUserScorers`.
- **Create** `lib/scoring/scorerScore.test.ts` — unit tests.
- **Modify** `lib/scoring/run.ts` — load scorer predictions + players, add scorer points.
- **Create** `lib/players/queries.ts` — search, contenders, my picks, actual top 10, lock status.
- **Create** `lib/players/actions.ts` — addPick / removePick / setGoldenBoot / setBootGoals (lock-checked).
- **Create** `app/(app)/scorers/page.tsx` + `app/(app)/scorers/scorers-client.tsx` — the tab.
- **Create** `components/scorers/PlayerSearch.tsx`, `components/scorers/PickRow.tsx`, `components/scorers/ActualTop10.tsx`.
- **Modify** `components/nav/BottomNav.tsx` — add 5th tab.
- **Modify** `lib/i18n/dictionaries/en.ts` + `es.ts` — add `scorers` section.
- **Create** `app/api/cron/poll-results/route.ts` change — call scorer refresh (Task 9).

---

## Task 1: Migration — players + scorer_predictions

**Files:**
- Create: `supabase/migrations/0006_players_scorers.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0006: Top Scorers & Golden Boot
create table if not exists public.players (
  id           text primary key,                 -- football-data player id (as text)
  name         text not null,
  team_id      text references public.teams(id),
  position     text,
  is_contender boolean not null default false,
  goals        integer not null default 0,       -- actual tournament goals (feed)
  scorer_rank  integer,                           -- actual rank among scorers, null if unranked
  created_at   timestamptz not null default now()
);
create index if not exists players_name_idx on public.players using gin (to_tsvector('simple', name));
create index if not exists players_team_idx on public.players (team_id);

create table if not exists public.scorer_predictions (
  user_id         uuid not null references auth.users(id) on delete cascade,
  player_id       text not null references public.players(id) on delete cascade,
  is_golden_boot  boolean not null default false,
  predicted_goals integer,
  created_at      timestamptz not null default now(),
  primary key (user_id, player_id)
);
create index if not exists scorer_pred_user_idx on public.scorer_predictions (user_id);

alter table public.players enable row level security;
alter table public.scorer_predictions enable row level security;

-- players: public read; writes service-role only (no write policy).
create policy "players readable" on public.players for select to anon, authenticated using (true);

-- scorer_predictions: owner-only CRUD.
create policy "own scorer picks readable" on public.scorer_predictions
  for select to authenticated using (user_id = auth.uid());
create policy "own scorer picks insertable" on public.scorer_predictions
  for insert to authenticated with check (user_id = auth.uid());
create policy "own scorer picks updatable" on public.scorer_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own scorer picks deletable" on public.scorer_predictions
  for delete to authenticated using (user_id = auth.uid());

-- Base GRANTs (RLS narrows; without these the API roles are denied at privilege level).
grant select on public.players to anon, authenticated;
grant select, insert, update, delete on public.scorer_predictions to authenticated;
```

- [ ] **Step 2: Apply locally to verify it runs**

Run: `npx supabase db reset` is too destructive; instead apply just this file against the LOCAL db:
`psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/migrations/0006_players_scorers.sql`
Expected: `CREATE TABLE` / `CREATE POLICY` / `GRANT` lines, no errors.
(If local Supabase isn't running, skip and rely on tsc/tests; the SQL is verified at deploy time.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_players_scorers.sql
git commit -m "feat(db): players + scorer_predictions tables (migration 0006)"
```

---

## Task 2: Scoring config — add `scorer` block

**Files:**
- Modify: `lib/scoring/types.ts`
- Test: `lib/scoring/types.test.ts` (exists)

- [ ] **Step 1: Add a failing test** in `lib/scoring/types.test.ts`

```ts
import { parseScoringConfig, DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";
// ...existing imports/tests...

it("defaults the scorer block and merges partial overrides", () => {
  expect(DEFAULT_SCORING_CONFIG.scorer).toEqual({ hit: 8, boot: 30, bootExact: 10 });
  const merged = parseScoringConfig({ scorer: { boot: 50 } });
  expect(merged.scorer).toEqual({ hit: 8, boot: 50, bootExact: 10 });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `npx vitest run lib/scoring/types.test.ts`
Expected: FAIL (`scorer` undefined).

- [ ] **Step 3: Implement** — edit `lib/scoring/types.ts`

In `LeagueScoringConfig` add after `ko`:
```ts
  scorer: { hit: number; boot: number; bootExact: number };
```
In `DEFAULT_SCORING_CONFIG` add after `ko`:
```ts
  scorer: { hit: 8, boot: 30, bootExact: 10 },
```
In `parseScoringConfig`, change the cast to include `scorer?: Partial<...>` and add to the returned object:
```ts
  const c = (raw ?? {}) as Partial<LeagueScoringConfig> & {
    ko?: Partial<LeagueScoringConfig["ko"]>;
    scorer?: Partial<LeagueScoringConfig["scorer"]>;
  };
  // ...
    ko: { ...d.ko, ...(c.ko ?? {}) },
    scorer: { ...d.scorer, ...(c.scorer ?? {}) },
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `npx vitest run lib/scoring/types.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/types.ts lib/scoring/types.test.ts
git commit -m "feat(scoring): add scorer config block (hit/boot/bootExact)"
```

---

## Task 3: Pure scorer scoring

**Files:**
- Create: `lib/scoring/scorerScore.ts`
- Create: `lib/scoring/scorerScore.test.ts`

- [ ] **Step 1: Write the failing test** `lib/scoring/scorerScore.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { scoreUserScorers } from "@/lib/scoring/scorerScore";
import { DEFAULT_SCORING_CONFIG as cfg } from "@/lib/scoring/types";

describe("scoreUserScorers", () => {
  const base = { actualTop10: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], actualTopScorerIds: ["A"], bootActualGoals: 7, config: cfg };

  it("awards hit points per pick in the actual top 10 (dedup-safe)", () => {
    const { points } = scoreUserScorers({ picks: ["A", "B", "X", "B"], goldenBootId: null, goldenBootPredictedGoals: null, ...base });
    expect(points).toBe(2 * cfg.scorer.hit); // A,B count once each
  });

  it("adds the boot bonus when the golden boot is the actual top scorer", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: null, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });

  it("counts a boot tied for #1 as correct", () => {
    const { points } = scoreUserScorers({ picks: ["B"], goldenBootId: "B", goldenBootPredictedGoals: null, ...base, actualTopScorerIds: ["A", "B"] });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });

  it("adds the exact-goals bonus when boot predicted goals match its actual goals", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: 7, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot + cfg.scorer.bootExact);
  });

  it("no exact bonus on a wrong tally", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: 5, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });

  it("zero when nothing matches", () => {
    const { points } = scoreUserScorers({ picks: ["X", "Y"], goldenBootId: "X", goldenBootPredictedGoals: 3, ...base });
    expect(points).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/scoring/scorerScore.test.ts` (module not found).

- [ ] **Step 3: Implement** `lib/scoring/scorerScore.ts`

```ts
import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface ScorerScoreInput {
  picks: string[];                       // the user's player ids (<=10)
  goldenBootId: string | null;
  goldenBootPredictedGoals: number | null;
  actualTop10: string[];                 // player ids, actual top 10 by goals
  actualTopScorerIds: string[];          // #1 (>1 on a tie)
  bootActualGoals: number | null;        // actual goals of the user's boot player
  config: LeagueScoringConfig;
}

/** Set-intersection size, dedupe-safe so malformed (duplicate) picks can't inflate. */
function intersectionCount(a: string[], b: string[]): number {
  const set = new Set(b);
  return new Set(a.filter((x) => set.has(x))).size;
}

export function scoreUserScorers(input: ScorerScoreInput): { points: number } {
  const { config: c } = input;
  let points = intersectionCount(input.picks, input.actualTop10) * c.scorer.hit;
  if (input.goldenBootId && input.actualTopScorerIds.includes(input.goldenBootId)) {
    points += c.scorer.boot;
  }
  if (
    input.goldenBootId &&
    input.goldenBootPredictedGoals != null &&
    input.bootActualGoals != null &&
    input.goldenBootPredictedGoals === input.bootActualGoals
  ) {
    points += c.scorer.bootExact;
  }
  return { points };
}
```

- [ ] **Step 4: Run tests, expect PASS** — `npx vitest run lib/scoring/scorerScore.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/scoring/scorerScore.ts lib/scoring/scorerScore.test.ts
git commit -m "feat(scoring): pure scoreUserScorers (top-10 hits + boot bonuses)"
```

---

## Task 4: Feed — ingest squads → players (pure parser + writer)

**Files:**
- Create: `lib/feed/ingestPlayers.ts`
- Create: `lib/feed/ingestPlayers.test.ts`

Reference the existing fetch pattern in `lib/feed/ingestWorldCup.ts` (`fetchImpl`, `X-Auth-Token`, `competitions/WC`).

- [ ] **Step 1: Write the failing test** `lib/feed/ingestPlayers.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toPlayerRows, parseScorerGoals, CONTENDER_NAMES } from "@/lib/feed/ingestPlayers";

describe("toPlayerRows", () => {
  it("flattens squads into player rows with team tla + contender flag", () => {
    const payload = { teams: [
      { tla: "FRA", squad: [{ id: 1, name: "Kylian Mbappé", position: "Offence" }, { id: 2, name: "Some Defender", position: "Defence" }] },
      { tla: "ARG", squad: [{ id: 3, name: "Lionel Messi", position: "Offence" }] },
    ] };
    const rows = toPlayerRows(payload);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ id: "1", name: "Kylian Mbappé", team_id: "FRA", position: "Offence", is_contender: true });
    expect(rows[1].is_contender).toBe(false);
  });
  it("skips players without an id and teams without a tla", () => {
    const rows = toPlayerRows({ teams: [{ tla: null, squad: [{ id: 9, name: "X" }] }, { tla: "BRA", squad: [{ id: null, name: "Y" }] }] });
    expect(rows).toEqual([]);
  });
});

describe("parseScorerGoals", () => {
  it("maps the scorers payload to id->goals with 1-based rank", () => {
    const payload = { scorers: [
      { player: { id: 1 }, goals: 5 },
      { player: { id: 2 }, goals: 3 },
    ] };
    expect(parseScorerGoals(payload)).toEqual([
      { id: "1", goals: 5, scorer_rank: 1 },
      { id: "2", goals: 3, scorer_rank: 2 },
    ]);
  });
});

it("contender list is non-empty and includes known stars", () => {
  expect(CONTENDER_NAMES.length).toBeGreaterThan(10);
  expect(CONTENDER_NAMES).toContain("Kylian Mbappé");
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run lib/feed/ingestPlayers.test.ts`.

- [ ] **Step 3: Implement** `lib/feed/ingestPlayers.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/** Curated Golden Boot contenders (matched by exact name to set is_contender). Tunable. */
export const CONTENDER_NAMES = [
  "Kylian Mbappé", "Erling Haaland", "Harry Kane", "Lionel Messi", "Vinícius Júnior",
  "Lautaro Martínez", "Julián Álvarez", "Bukayo Saka", "Phil Foden", "Jude Bellingham",
  "Cristiano Ronaldo", "Rafael Leão", "Victor Osimhen", "Mohamed Salah", "Lamine Yamal",
  "Olmo", "Antoine Griezmann", "Ousmane Dembélé", "Florian Wirtz", "Kai Havertz",
  "Memphis Depay", "Cody Gakpo", "Romelu Lukaku", "Dušan Vlahović", "Christian Pulisic",
];
const CONTENDERS = new Set(CONTENDER_NAMES);

interface FdSquadTeam { tla: string | null; squad?: Array<{ id: number | null; name: string; position?: string | null }> }
interface FdTeamsPayload { teams?: FdSquadTeam[] }

export interface PlayerRow {
  id: string; name: string; team_id: string; position: string | null; is_contender: boolean;
}

/** Pure: flatten /competitions/WC/teams squads into player rows. */
export function toPlayerRows(payload: FdTeamsPayload): PlayerRow[] {
  const out: PlayerRow[] = [];
  for (const t of payload.teams ?? []) {
    if (!t.tla) continue;
    for (const p of t.squad ?? []) {
      if (p.id == null) continue;
      out.push({ id: String(p.id), name: p.name, team_id: t.tla, position: p.position ?? null, is_contender: CONTENDERS.has(p.name) });
    }
  }
  return out;
}

interface FdScorersPayload { scorers?: Array<{ player: { id: number | null }; goals: number | null }> }
export interface ScorerGoalRow { id: string; goals: number; scorer_rank: number }

/** Pure: map /competitions/WC/scorers to id->goals with 1-based rank. */
export function parseScorerGoals(payload: FdScorersPayload): ScorerGoalRow[] {
  const out: ScorerGoalRow[] = [];
  (payload.scorers ?? []).forEach((s, i) => {
    if (s.player?.id == null) return;
    out.push({ id: String(s.player.id), goals: s.goals ?? 0, scorer_rank: i + 1 });
  });
  return out;
}

async function fdGet(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("Missing FOOTBALL_DATA_API_KEY");
  const res = await fetchImpl(`https://api.football-data.org/v4/competitions/WC/${path}`, { headers: { "X-Auth-Token": key } });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return res.json();
}

/** Fetch the 48 squads and upsert players (non-destructive). */
export async function ingestPlayers(admin: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<{ players: number }> {
  const payload = (await fdGet("teams", fetchImpl)) as FdTeamsPayload;
  const rows = toPlayerRows(payload);
  if (rows.length) {
    const { error } = await admin.from("players").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  return { players: rows.length };
}

/** Fetch the scorers board and update players.goals + scorer_rank. Resets ranks first. */
export async function refreshScorerGoals(admin: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<{ updated: number }> {
  const payload = (await fdGet("scorers?limit=30", fetchImpl)) as FdScorersPayload;
  const rows = parseScorerGoals(payload);
  for (const r of rows) {
    const { error } = await admin.from("players").update({ goals: r.goals, scorer_rank: r.scorer_rank }).eq("id", r.id);
    if (error) throw error;
  }
  return { updated: rows.length };
}
```

- [ ] **Step 4: Run tests, expect PASS** — `npx vitest run lib/feed/ingestPlayers.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/feed/ingestPlayers.ts lib/feed/ingestPlayers.test.ts
git commit -m "feat(feed): ingest squads to players + scorers refresh (pure parsers)"
```

---

## Task 5: Ingest script + npm wiring

**Files:**
- Create: `scripts/ingest-players.ts`
- Modify: `package.json`

- [ ] **Step 1: Create** `scripts/ingest-players.ts` (mirror `scripts/ingest-wc.ts`)

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
import ws from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error -- ws is compatible enough for supabase-js on Node 20.
  globalThis.WebSocket = ws;
}
import { createClient } from "@supabase/supabase-js";
import { ingestPlayers, refreshScorerGoals } from "../lib/feed/ingestPlayers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Missing Supabase env in .env.local");
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const p = await ingestPlayers(admin);
  const s = await refreshScorerGoals(admin);
  console.log(`Players ingested: ${p.players}; scorer goals updated: ${s.updated}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add the npm script** — in `package.json` `"scripts"` add:
```json
    "ingest:players": "tsx scripts/ingest-players.ts",
```

- [ ] **Step 3: Verify it typechecks** — Run `npx tsc --noEmit` → no errors. (Do NOT run against prod yet; that's the deploy task.)

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest-players.ts package.json
git commit -m "feat(scripts): ingest:players (squads + scorer goals)"
```

---

## Task 6: Wire scorer points into runScoring

**Files:**
- Modify: `lib/scoring/run.ts`
- Test: `lib/scoring/run.itest.ts` (extend — integration; optional to run without Docker)

Read `lib/scoring/run.ts` first. `runScoring` already builds `scored = userIds.map(...)`. Add scorer points there.

- [ ] **Step 1: Add data loads** — in `runScoring`'s `Promise.all` batch, add two queries:
```ts
    admin.from("players").select("id, goals, scorer_rank"),
    admin.from("scorer_predictions").select("user_id, player_id, is_golden_boot, predicted_goals"),
```
Destructure as `playersRes, scorerPredsRes` and include both in the error-check loop.

- [ ] **Step 2: Compute actuals once** (after the koPreds maps, before the league loop):
```ts
import { scoreUserScorers } from "@/lib/scoring/scorerScore";
// ...
const allPlayers = (playersRes.data ?? []) as { id: string; goals: number; scorer_rank: number | null }[];
const ranked = allPlayers.filter((p) => p.scorer_rank != null).sort((a, b) => (a.scorer_rank! - b.scorer_rank!));
const actualTop10 = ranked.slice(0, 10).map((p) => p.id);
const topGoals = ranked.length ? ranked[0].goals : 0;
const actualTopScorerIds = topGoals > 0 ? allPlayers.filter((p) => p.goals === topGoals).map((p) => p.id) : [];
const goalsByPlayer = new Map(allPlayers.map((p) => [p.id, p.goals]));

const scorerByUser = new Map<string, { picks: string[]; bootId: string | null; bootGoals: number | null }>();
for (const r of scorerPredsRes.data ?? []) {
  const e = scorerByUser.get(r.user_id) ?? { picks: [], bootId: null, bootGoals: null };
  e.picks.push(r.player_id);
  if (r.is_golden_boot) { e.bootId = r.player_id; e.bootGoals = r.predicted_goals; }
  scorerByUser.set(r.user_id, e);
}
```

- [ ] **Step 3: Add scorer points to each user's total** — inside the `userIds.map((userId) => {` block, after computing `ko`, before the `return`:
```ts
      const sc = scorerByUser.get(userId);
      const scorer = sc
        ? scoreUserScorers({
            picks: sc.picks, goldenBootId: sc.bootId, goldenBootPredictedGoals: sc.bootGoals,
            actualTop10, actualTopScorerIds, bootActualGoals: sc.bootId ? (goalsByPlayer.get(sc.bootId) ?? null) : null, config,
          }).points
        : 0;
```
Change the return to: `points: group.points + ko.points + scorer, ...`.

- [ ] **Step 4: Include scorer-only users** — where `allUserIds` is built for achievements, also union `scorerByUser.keys()` is NOT needed for standings (standings iterate league members). No change needed; scorer points only apply to league members, which is correct.

- [ ] **Step 5: Verify** — Run `npx tsc --noEmit` (no errors) and `npx vitest run` (all existing unit tests pass; the `.itest.ts` needs Docker and may be skipped). 

- [ ] **Step 6: Commit**

```bash
git add lib/scoring/run.ts
git commit -m "feat(scoring): fold scorer points into runScoring standings"
```

---

## Task 7: players queries + lock helper

**Files:**
- Create: `lib/players/queries.ts`

- [ ] **Step 1: Implement** `lib/players/queries.ts`

```ts
import { createClient } from "@/lib/supabase/server";

export interface PlayerLite { id: string; name: string; teamId: string | null; flag: string | null; goals: number; scorerRank: number | null; }
export interface MyScorerPick { playerId: string; isGoldenBoot: boolean; predictedGoals: number | null; }

const FLAG_BY_TLA: Record<string, string> = {}; // optional: reuse teams.flag join below instead

/** Join players -> teams for the flag. */
async function withFlags(rows: { id: string; name: string; team_id: string | null; goals: number; scorer_rank: number | null }[]): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))] as string[];
  const flagByTeam = new Map<string, string | null>();
  if (teamIds.length) {
    const { data: teams } = await supabase.from("teams").select("id, flag").in("id", teamIds);
    for (const t of teams ?? []) flagByTeam.set(t.id, t.flag);
  }
  return rows.map((r) => ({ id: r.id, name: r.name, teamId: r.team_id, flag: r.team_id ? flagByTeam.get(r.team_id) ?? null : null, goals: r.goals, scorerRank: r.scorer_rank }));
}

/** Typeahead search (case-insensitive, name contains). */
export async function searchPlayers(q: string): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const term = q.trim();
  if (term.length < 2) return [];
  const { data } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").ilike("name", `%${term}%`).order("goals", { ascending: false }).limit(20);
  return withFlags(data ?? []);
}

/** Curated contenders for quick-pick. */
export async function getContenders(): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").eq("is_contender", true).order("name").limit(30);
  return withFlags(data ?? []);
}

/** The signed-in user's picks (joined to player display). */
export async function getMyScorerBoard(): Promise<{ picks: PlayerLite[]; bootId: string | null; bootGoals: number | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { picks: [], bootId: null, bootGoals: null };
  const { data: preds } = await supabase.from("scorer_predictions").select("player_id, is_golden_boot, predicted_goals").eq("user_id", user.id);
  const ids = (preds ?? []).map((p) => p.player_id);
  let picks: PlayerLite[] = [];
  if (ids.length) {
    const { data: rows } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").in("id", ids);
    picks = await withFlags(rows ?? []);
  }
  const boot = (preds ?? []).find((p) => p.is_golden_boot);
  return { picks, bootId: boot?.player_id ?? null, bootGoals: boot?.predicted_goals ?? null };
}

/** Actual Top 10 by scorer_rank. */
export async function getActualTop10(): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").not("scorer_rank", "is", null).order("scorer_rank").limit(10);
  return withFlags(data ?? []);
}

/** Locked once the Round of 32 has begun (any KO match final/started, or all groups final). */
export async function scorersLocked(): Promise<boolean> {
  const supabase = await createClient();
  const { data: ko } = await supabase.from("matches").select("status, lock_at").in("stage", ["r32", "r16", "qf", "sf", "final", "third"]);
  const now = Date.now();
  return (ko ?? []).some((m) => m.status === "final" || m.status === "live" || (m.lock_at !== null && new Date(m.lock_at).getTime() <= now));
}
```
Remove the unused `FLAG_BY_TLA` const if the linter complains.

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/players/queries.ts
git commit -m "feat(players): search/contenders/my-board/top10 + lock query"
```

---

## Task 8: players actions (lock-checked, invariants)

**Files:**
- Create: `lib/players/actions.ts`

- [ ] **Step 1: Implement** `lib/players/actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { scorersLocked } from "@/lib/players/queries";

const MAX_PICKS = 10;

async function userOrThrow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "no_user" as const };
  if (await scorersLocked()) return { error: "locked" as const };
  return { supabase, userId: user.id };
}

export async function addScorerPick(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const { count } = await supabase.from("scorer_predictions").select("*", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_PICKS) return { error: "max" as const };
  const { error } = await supabase.from("scorer_predictions").upsert({ user_id: userId, player_id: playerId }, { onConflict: "user_id,player_id" });
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

export async function removeScorerPick(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const { error } = await supabase.from("scorer_predictions").delete().eq("user_id", userId).eq("player_id", playerId);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

/** Mark one pick as the Golden Boot (clears the flag on all others). The boot must be a current pick. */
export async function setGoldenBoot(playerId: string) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  await supabase.from("scorer_predictions").update({ is_golden_boot: false }).eq("user_id", userId).neq("player_id", playerId);
  const { error } = await supabase.from("scorer_predictions").update({ is_golden_boot: true }).eq("user_id", userId).eq("player_id", playerId);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}

export async function setBootGoals(predictedGoals: number | null) {
  const ctx = await userOrThrow();
  if ("error" in ctx) return ctx;
  const { supabase, userId } = ctx;
  const g = predictedGoals == null ? null : Math.max(0, Math.min(30, Math.floor(predictedGoals)));
  const { error } = await supabase.from("scorer_predictions").update({ predicted_goals: g }).eq("user_id", userId).eq("is_golden_boot", true);
  if (error) return { error: "db" as const };
  revalidatePath("/scorers");
  return { ok: true as const };
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/players/actions.ts
git commit -m "feat(players): server actions (add/remove/boot/goals) with R32 lock"
```

---

## Task 9: i18n strings

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`, `lib/i18n/dictionaries/es.ts`

- [ ] **Step 1: Add the `scorers` block to `en.ts`** (before the `meta:` block):

```ts
  scorers: {
    tab: "Scorers",
    eyebrow: "TOP SCORERS",
    title: "Golden Boot",
    intro: "Pick the 10 players you think will be the tournament's top scorers, then crown your Golden Boot.",
    progress: (n: number) => `${n}/10 picked`,
    addPlayer: "Add a player",
    searchPlaceholder: "Search players…",
    contenders: "Top contenders",
    goldenBoot: "Golden Boot",
    setBoot: "Make Golden Boot",
    predictedGoals: "Predicted goals",
    remove: "Remove",
    locked: "Picks are locked — the knockouts have begun.",
    lockHint: "Editable until the Round of 32 begins.",
    actualTop10: "Live Top 10",
    noActualYet: "No goals yet — the board fills as matches are played.",
    goals: (n: number) => `${n} ${n === 1 ? "goal" : "goals"}`,
    inTop10: "In the Top 10",
    errMax: "You can only pick 10 players.",
    errLocked: "Picks are locked.",
    errGeneric: "Something went wrong — try again.",
    saved: "Saved",
  },
```

- [ ] **Step 2: Add the same keys to `es.ts`** with Spanish values:

```ts
  scorers: {
    tab: "Goleadores",
    eyebrow: "GOLEADORES",
    title: "Bota de Oro",
    intro: "Elige los 10 jugadores que crees que serán los máximos goleadores del torneo y corona tu Bota de Oro.",
    progress: (n: number) => `${n}/10 elegidos`,
    addPlayer: "Añadir jugador",
    searchPlaceholder: "Buscar jugadores…",
    contenders: "Candidatos",
    goldenBoot: "Bota de Oro",
    setBoot: "Hacer Bota de Oro",
    predictedGoals: "Goles previstos",
    remove: "Quitar",
    locked: "Las elecciones están bloqueadas — empezaron las eliminatorias.",
    lockHint: "Editable hasta que empiecen los Dieciseisavos.",
    actualTop10: "Top 10 en vivo",
    noActualYet: "Aún no hay goles — la tabla se llena a medida que se juegan los partidos.",
    goals: (n: number) => `${n} ${n === 1 ? "gol" : "goles"}`,
    inTop10: "En el Top 10",
    errMax: "Solo puedes elegir 10 jugadores.",
    errLocked: "Las elecciones están bloqueadas.",
    errGeneric: "Algo salió mal — inténtalo de nuevo.",
    saved: "Guardado",
  },
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (es must match en's shape) → no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/es.ts
git commit -m "feat(i18n): scorers strings (EN/ES)"
```

---

## Task 10: Bottom nav — 5th tab

**Files:**
- Modify: `components/nav/BottomNav.tsx`

- [ ] **Step 1: Add the tab** — in the `TABS` array (which already reads `t.nav.*`), append the Scorers entry using the scorers dict:
```tsx
    { href: "/scorers", label: t.scorers.tab, icon: "🥇" },
```
(Insert after the Bracket entry so order is Predict · Bracket · Scorers · Leagues · Account.)

- [ ] **Step 2: Verify** — `npm run build` compiles; the bottom bar shows 5 tabs (still fits `max-w-md` — each tab is `flex-1`).

- [ ] **Step 3: Commit**

```bash
git add components/nav/BottomNav.tsx
git commit -m "feat(nav): add Scorers tab"
```

---

## Task 11: Scorers UI — components

**Files:**
- Create: `components/scorers/PlayerSearch.tsx`
- Create: `components/scorers/PickRow.tsx`
- Create: `components/scorers/ActualTop10.tsx`

- [ ] **Step 1: `PickRow.tsx`** — one chosen player row (flag · name · team, star to set Boot, remove, Boot goals input).

```tsx
"use client";
import type { PlayerLite } from "@/lib/players/queries";
import { useI18n } from "@/lib/i18n/provider";

export function PickRow({
  player, isBoot, predictedGoals, locked, actualGoals, inTop10, onSetBoot, onRemove, onGoals,
}: {
  player: PlayerLite; isBoot: boolean; predictedGoals: number | null; locked: boolean;
  actualGoals?: number; inTop10?: boolean;
  onSetBoot: () => void; onRemove: () => void; onGoals: (v: number | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className={"rounded-2xl border px-3 py-2.5 " + (isBoot ? "border-[var(--bn-gold)] bg-[var(--bn-gold)]/[0.06]" : "border-white/10 bg-white/[0.02]")}>
      <div className="flex items-center gap-2">
        <button onClick={onSetBoot} disabled={locked} aria-label={t.scorers.setBoot} className={"text-lg " + (isBoot ? "" : "opacity-30 hover:opacity-70")}>{isBoot ? "🥇" : "☆"}</button>
        <span className="text-lg" aria-hidden>{player.flag ?? "🏳️"}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.name} <span className="text-white/40">{player.teamId}</span></span>
        {actualGoals != null && <span className="text-xs text-white/55">{t.scorers.goals(actualGoals)}{inTop10 ? " ✓" : ""}</span>}
        {!locked && <button onClick={onRemove} className="text-xs font-bold text-red-400/80">✕</button>}
      </div>
      {isBoot && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/40">{t.scorers.predictedGoals}</span>
          <input type="number" inputMode="numeric" min={0} max={30} disabled={locked} defaultValue={predictedGoals ?? ""}
            onChange={(e) => onGoals(e.target.value === "" ? null : Math.max(0, Math.min(30, Math.floor(Number(e.target.value)))))}
            className="h-9 w-14 rounded-lg border border-white/15 bg-black/30 text-center text-sm font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none focus:border-[var(--bn-gold)]" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `PlayerSearch.tsx`** — typeahead + contenders chips; calls `onAdd(id)`.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { searchPlayers, type PlayerLite } from "@/lib/players/queries";
import { useI18n } from "@/lib/i18n/provider";

export function PlayerSearch({ contenders, chosenIds, onAdd }: { contenders: PlayerLite[]; chosenIds: Set<string>; onAdd: (id: string) => void; }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerLite[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => setResults(await searchPlayers(q)), 250);
  }, [q]);
  const Chip = ({ p }: { p: PlayerLite }) => (
    <button onClick={() => onAdd(p.id)} disabled={chosenIds.has(p.id)} className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs font-bold disabled:opacity-30">
      <span aria-hidden>{p.flag ?? "🏳️"}</span><span className="max-w-[120px] truncate">{p.name}</span><span className="text-[var(--bn-gold)]">+</span>
    </button>
  );
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.scorers.searchPlaceholder}
        className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-[var(--bn-gold)]" />
      {results.length > 0 && <div className="flex flex-wrap gap-2">{results.map((p) => <Chip key={p.id} p={p} />)}</div>}
      {q.trim().length < 2 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.contenders}</p>
          <div className="flex flex-wrap gap-2">{contenders.map((p) => <Chip key={p.id} p={p} />)}</div>
        </div>
      )}
    </div>
  );
}
```
NOTE: `searchPlayers` is a server function imported into a client component — wrap it as a server action. To keep it simple, create `lib/players/search-action.ts` with `"use server"` exporting `export async function searchPlayersAction(q: string) { return searchPlayers(q); }` and import THAT in `PlayerSearch`. Add this file in this step and use it.

- [ ] **Step 3: `ActualTop10.tsx`** — the live board.

```tsx
import type { PlayerLite } from "@/lib/players/queries";
import type { Dictionary } from "@/lib/i18n";

export function ActualTop10({ rows, t }: { rows: PlayerLite[]; t: Dictionary }) {
  if (rows.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/50">{t.scorers.noActualYet}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((p, i) => (
        <li key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <span className="flex items-center gap-3"><span className="w-5 text-center font-extrabold text-[var(--bn-gold)]">{i + 1}</span><span aria-hidden>{p.flag ?? "🏳️"}</span><span className="text-sm font-semibold">{p.name}</span></span>
          <span className="text-sm font-black tabular-nums text-[var(--bn-gold)]">{p.goals}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` → no errors.

- [ ] **Step 5: Commit**

```bash
git add components/scorers lib/players/search-action.ts
git commit -m "feat(scorers): picker, pick row, and live top-10 components"
```

---

## Task 12: Scorers page + client

**Files:**
- Create: `app/(app)/scorers/page.tsx`
- Create: `app/(app)/scorers/scorers-client.tsx`

- [ ] **Step 1: `page.tsx`** (server) — loads data + lock + actual top 10.

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContenders, getMyScorerBoard, getActualTop10, scorersLocked } from "@/lib/players/queries";
import { getT } from "@/lib/i18n";
import { ActualTop10 } from "@/components/scorers/ActualTop10";
import { ScorersClient } from "./scorers-client";

export default async function ScorersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { t } = await getT();
  const [contenders, board, top10, locked] = await Promise.all([getContenders(), getMyScorerBoard(), getActualTop10(), scorersLocked()]);

  return (
    <main className="mx-auto max-w-md space-y-5 p-6 pb-24">
      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.scorers.eyebrow}</p>
        <h1 className="text-2xl font-black">🥇 {t.scorers.title}</h1>
        <p className="mt-1 text-sm text-white/60">{t.scorers.intro}</p>
        <p className="mt-1 text-xs text-white/40">{locked ? t.scorers.locked : t.scorers.lockHint}</p>
      </div>

      <ScorersClient contenders={contenders} initialPicks={board.picks} initialBootId={board.bootId} initialBootGoals={board.bootGoals} locked={locked} />

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.actualTop10}</p>
        <ActualTop10 rows={top10} t={t} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `scorers-client.tsx`** (client) — manages picks state, calls actions, renders search + pick rows.

```tsx
"use client";
import { useMemo, useState, useTransition } from "react";
import { addScorerPick, removeScorerPick, setGoldenBoot, setBootGoals } from "@/lib/players/actions";
import { PlayerSearch } from "@/components/scorers/PlayerSearch";
import { PickRow } from "@/components/scorers/PickRow";
import { useI18n } from "@/lib/i18n/provider";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import type { PlayerLite } from "@/lib/players/queries";

export function ScorersClient({ contenders, initialPicks, initialBootId, initialBootGoals, locked }: {
  contenders: PlayerLite[]; initialPicks: PlayerLite[]; initialBootId: string | null; initialBootGoals: number | null; locked: boolean;
}) {
  const { t } = useI18n();
  const celebrate = useCelebration();
  const [picks, setPicks] = useState<PlayerLite[]>(initialPicks);
  const [bootId, setBootId] = useState<string | null>(initialBootId);
  const [bootGoals, setBootGoalsState] = useState<number | null>(initialBootGoals);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const chosenIds = useMemo(() => new Set(picks.map((p) => p.id)), [picks]);

  function add(id: string) {
    if (picks.length >= 10) { setErr(t.scorers.errMax); return; }
    const p = contenders.find((c) => c.id === id);
    // fall back to a minimal record; the row shows name once server revalidates
    const next = [...picks, p ?? { id, name: id, teamId: null, flag: null, goals: 0, scorerRank: null }];
    setPicks(next); setErr(null);
    start(async () => { const r = await addScorerPick(id); if ("error" in r) { setErr(r.error === "max" ? t.scorers.errMax : r.error === "locked" ? t.scorers.errLocked : t.scorers.errGeneric); setPicks(picks); } else if (next.length === 10 && bootId) celebrate("small"); });
  }
  function remove(id: string) { const next = picks.filter((p) => p.id !== id); setPicks(next); if (bootId === id) setBootId(null); start(async () => { await removeScorerPick(id); }); }
  function makeBoot(id: string) { setBootId(id); start(async () => { const r = await setGoldenBoot(id); if (!("error" in r) && picks.length === 10) celebrate("small"); }); }
  function goals(v: number | null) { setBootGoalsState(v); start(async () => { await setBootGoals(v); }); }

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-white/55">{t.scorers.progress(picks.length)}</p>
      <div className="space-y-2">
        {picks.map((p) => (
          <PickRow key={p.id} player={p} isBoot={bootId === p.id} predictedGoals={bootGoals} locked={locked}
            onSetBoot={() => makeBoot(p.id)} onRemove={() => remove(p.id)} onGoals={goals} />
        ))}
      </div>
      {!locked && picks.length < 10 && <PlayerSearch contenders={contenders} chosenIds={chosenIds} onAdd={add} />}
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` (no errors), `npm run build` (compiles, `/scorers` route appears), `npx vitest run` (all green).

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/scorers"
git commit -m "feat(scorers): /scorers tab — pick 10, crown Golden Boot, live Top 10"
```

---

## Task 13: Cron — refresh scorer goals

**Files:**
- Modify: `app/api/cron/poll-results/route.ts`

- [ ] **Step 1: Read the route**, then after the existing results refresh / before `runScoring`, add a scorer-goals refresh so standings reflect goals:
```ts
import { refreshScorerGoals } from "@/lib/feed/ingestPlayers";
// inside the handler, after refreshWorldCupResults(...):
try { await refreshScorerGoals(admin); } catch (e) { console.error("scorer refresh failed", e); }
```
(Use the same `admin` service-role client already created in the route. Wrap in try/catch so a scorers API hiccup never blocks match scoring.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` → no errors; `npm run build` compiles.

- [ ] **Step 3: Commit**

```bash
git add "app/api/cron/poll-results/route.ts"
git commit -m "feat(cron): refresh scorer goals in poll-results"
```

---

## Task 14: Deploy artifacts (combined SQL + prod ingest note)

**Files:**
- Create: `supabase/PROD_SETUP_0006.sql`
- Modify: `DEPLOY.md`

- [ ] **Step 1: Generate the combined SQL** for the SQL Editor:
```bash
cp supabase/migrations/0006_players_scorers.sql supabase/PROD_SETUP_0006.sql
```

- [ ] **Step 2: Append a deploy section to `DEPLOY.md`**:
```markdown
## Top Scorers feature (migration 0006)
1. Supabase SQL Editor → paste `supabase/PROD_SETUP_0006.sql` → Run.
2. Ingest players + current scorer goals against prod:
   `npm run ingest:players`   (uses .env.local hosted values)
3. Merge `feat-top-scorers` → `main` (auto-deploys to Vercel).
```

- [ ] **Step 3: Commit**

```bash
git add supabase/PROD_SETUP_0006.sql DEPLOY.md
git commit -m "chore(deploy): prod SQL + runbook for scorers feature"
```

---

## Final verification (before finishing the branch)

- [ ] `npx tsc --noEmit` clean.
- [ ] `npx vitest run` — all unit tests green (existing 98 + new scorer/feed/config tests).
- [ ] `npm run build` — compiles; routes include `/scorers`.
- [ ] Manual: bottom nav shows 5 tabs; `/scorers` renders the picker, contenders, and an (empty) live Top 10.
- [ ] Deploy: apply `0006` to hosted DB, `npm run ingest:players`, then merge to `main`.

---

## Notes for the implementer

- **DON'T merge to `main` until** the migration is applied to the hosted Supabase project AND `ingest:players` has run — `main` auto-deploys to prod, and the live app would 500 on `/scorers` without the `players` table.
- The app's i18n rule: never hardcode user-facing text — every string goes through `lib/i18n/dictionaries/en.ts` + `es.ts` (see the existing `i18n-convention`).
- Server functions (`searchPlayers`) can't be imported directly into client components — use the `"use server"` `searchPlayersAction` wrapper (Task 11 Step 2).
- `getActualTop10` ordering uses `scorer_rank`; `runScoring`'s top-10 derivation also uses `scorer_rank` — keep both consistent.
