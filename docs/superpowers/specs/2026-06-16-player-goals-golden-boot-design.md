# Top Scorers & Golden Boot — Design Spec

**Date:** 2026-06-16
**Status:** Approved (design)
**App:** Bracket Royale (Next.js 16 + Supabase, bilingual EN/ES, deployed at bracket-royal.vercel.app)

## Goal

A new prediction mode where each user picks the **10 players** they think will be the
tournament's top scorers and crowns **1 as their Golden Boot** (with a predicted goal
tally). Scored against the live football-data.org top-scorers feed; points roll into the
existing league standings.

## Decisions (from brainstorming)

- **Prediction:** an *unordered set of 10* players + exactly one designated **Golden Boot**.
  The Golden Boot **must be one of your 10**.
- **Goal tally:** predicted goals are entered **only for the Golden Boot** (not per player).
- **Player picker:** search/typeahead over all players + a curated "Top contenders" quick-pick
  row. Backed by a `players` table ingested from the 48 squads (~1,250 players).
- **Scoring (added to league points):** `+8` per pick who finishes in the actual Top 10
  (max 80) · `+30` if your Golden Boot is the actual top scorer · `+10` if your Boot's
  predicted goals equal that player's actual goals.
- **Lock:** picks are editable through the group stage and **lock when the Round of 32
  begins** (first KO kickoff / all group matches final).
- **Placement:** a new **5th bottom-nav tab "Scorers"** (⚽).
- **Leaderboard:** scorer points merge into the main league standings (not separate).

## Data model (migration `0006_players_scorers.sql`)

```
players
  id            text primary key         -- football-data player id (as text)
  name          text not null
  team_id       text references teams(id)
  position      text                     -- e.g. 'Offence','Midfield' (from feed)
  is_contender  boolean not null default false
  goals         integer not null default 0   -- actual tournament goals (feed)
  scorer_rank   integer                  -- actual rank among scorers, null if unranked
  created_at    timestamptz not null default now()
-- RLS: SELECT to anon+authenticated (public read). Writes service-role only.

scorer_predictions
  user_id         uuid references auth.users(id) on delete cascade
  player_id       text references players(id)
  is_golden_boot  boolean not null default false
  predicted_goals integer                -- meaningful only on the Boot row
  created_at      timestamptz not null default now()
  primary key (user_id, player_id)
-- RLS: owner-only CRUD (user_id = auth.uid()). DML grants to API roles.
```

App-level invariants (enforced in server actions): a user has **≤10** rows; **≤1** row
with `is_golden_boot = true`; the Boot row is one of the 10.

## Ingestion & actuals

- **Squads → players:** extend the feed (`lib/feed/ingestWorldCup.ts` or a sibling
  `ingestPlayers.ts`) to call `/v4/competitions/WC/teams`, flatten `team.squad[]`, and
  upsert `players` (id, name, team_id=tla, position). Non-destructive upsert.
- **Contenders:** a curated array of ~20 known names (Mbappé, Haaland, Kane, …); ingest
  matches by name to set `is_contender = true`. (Tunable later.)
- **Actual goals:** the poll-results path also calls `/v4/competitions/WC/scorers` and
  updates `players.goals` + `scorer_rank` for returned players (others stay 0/null).
- New npm script `ingest:players` (and the squad step folds into `ingest:wc`).

**Actual Top 10 / top scorer** derive from `players` ordered by `goals desc` (then a
deterministic tiebreak). Ties for #1: any Boot tied for the top counts as correct.

## Scoring (`lib/scoring/scorerScore.ts`, pure + tested)

```
scoreUserScorers({
  picks: string[],                 // the user's ≤10 player ids
  goldenBootId: string | null,
  goldenBootPredictedGoals: number | null,
  actualTop10: string[],           // player ids, actual top 10 by goals
  actualTopScorerIds: string[],    // #1 (may be >1 on a tie)
  bootActualGoals: number | null,  // actual goals of the user's Boot player
  config: LeagueScoringConfig,
}) -> { points: number }
```
- `+config.scorer.hit` for each pick in `actualTop10` (set intersection, dedup-safe).
- `+config.scorer.boot` if `goldenBootId ∈ actualTopScorerIds`.
- `+config.scorer.bootExact` if `goldenBootPredictedGoals === bootActualGoals` (and Boot set).

Config defaults add `scorer: { hit: 8, boot: 30, bootExact: 10 }` to `LeagueScoringConfig`
(parsed with the existing `parseScoringConfig`). `runScoring` loads `scorer_predictions` +
`players`, computes the actuals once, and adds each user's scorer points to their league
total. Covered by unit tests + extended `run` integration test.

## Lock

- Lock predicate: the Round of 32 has begun — i.e. every group match is final, or the
  earliest KO `kickoff_at` ≤ now. Exposed by a small query helper.
- The save server actions (add pick / remove pick / set Boot / set Boot goals) **reject
  writes once locked**; the UI renders read-only with a "locked" banner. (DB-level RLS
  lock check is a possible later hardening; v1 enforces in the action.)

## UI — `/scorers` (new tab)

- **Bottom nav:** add a 5th tab `Scorers` (⚽) in `components/nav/BottomNav.tsx`.
- **Page (`app/(app)/scorers/page.tsx`)** + client:
  - Header + progress ("X/10 picked") + lock status.
  - **Your picks:** list of chosen players (flag · name · team). One is starred as the
    Golden Boot; the Boot shows a goals input.
  - **Add player:** typeahead search (client queries `players` via `ilike(name)`, joined to
    teams for flag, limit ~20) + a "Top contenders" chip row (`is_contender`).
  - **Post-lock / once goals arrive:** each pick shows actual goals + ✓ if in the real Top
    10; plus a live **actual Top 10** board (ordered by `goals`).
  - Confetti reward when the 10th pick + Boot are set (reusing `useCelebration`).
- **i18n:** new `scorers` section in `lib/i18n/dictionaries/en.ts` + `es.ts`. No hardcoded
  user-facing text.

## Components / boundaries

- `lib/players/queries.ts` — search + contenders + the user's current picks.
- `lib/players/actions.ts` — addPick / removePick / setGoldenBoot / setBootGoals (lock-checked).
- `lib/scoring/scorerScore.ts` — pure scoring (new).
- `lib/feed/ingestPlayers.ts` (+ scorers refresh) — feed additions.
- `components/scorers/*` — picker, search, pick row, actual-top-10 board.
- Touch points (additive): `runScoring`, the feed/cron, `BottomNav`, i18n, scoring `types`.

## Deploy

Ships as migration `0006` (run in the Supabase SQL editor on the hosted project, same as
`PROD_SETUP.sql`), then `npm run ingest:players` against prod, then redeploy. A combined
`supabase/PROD_SETUP_0006.sql` will be generated for convenience.

## Out of scope (v1)

- Per-player goal predictions beyond the Golden Boot.
- Assists / own-goals / penalties weighting.
- A standalone scorers-only leaderboard.
- Realtime live updates of the actual Top 10 (server-render/refresh is fine for v1).
