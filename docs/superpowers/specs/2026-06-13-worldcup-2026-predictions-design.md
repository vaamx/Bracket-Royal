# World Cup 2026 Predictions — Design Spec

**Date:** 2026-06-13
**Working title:** Bracket Royale (TBD)
**Status:** Approved design, ready for implementation planning

---

## 1. Summary

A mobile-first PWA where friends predict the FIFA World Cup 2026 by entering a
scoreline for every match, then build a knockout bracket once the real qualifiers
are known. Predictions are scored against **live real-world results**, updating
points and leaderboards in real time. Players compete in private invite leagues
and a global table. The aesthetic is "Broadcast Night" (deep navy + gold, glassy,
premium TV feel) with an arcade-fun game-feel layer (spring animations, celebration
moments, streaks, badges).

This spec covers **Phase 1** (the beautiful vertical slice — the complete fun loop).
Notifications and ancillary screens are explicitly **deferred to Phase 2** (Section 11).

---

## 2. Product Decisions (locked)

| Decision | Choice |
|---|---|
| Truth source | **Live real-results feed** — app ingests actual WC2026 results, scores against reality |
| Prediction unit (groups) | **Every match scoreline** (all 72 group matches) |
| Prediction unit (knockout) | **Full bracket upfront** — pick advancers forward to champion, on the real qualifiers |
| Competition | **Private leagues (invite) + a global leaderboard** |
| Timing | **Per-match lock at kickoff** — already-played matches are locked & show real results |
| Scoring | Defaults below, **league-configurable** by the commissioner |
| Visual direction | **Broadcast Night** + fun-game energy |
| Build approach | **Beautiful vertical slice first**, notifications in Phase 2 |

---

## 3. Domain Rules (FIFA World Cup 2026)

These are real-world facts the app must encode correctly. (Verified via deep research, 2026-06-13.)

- **Hosts:** USA, Canada, Mexico. **Dates:** June 11 – July 19, 2026.
- **48 teams**, **12 groups of four** (Groups A–L). Each team plays **3 group matches**.
- **Group points:** Win 3, Draw 1, Loss 0.
- **104 total matches:** 72 group-stage + 32 knockout.
- **Advancement:** top 2 of each group (24) + **8 best third-placed teams** = **32** → **Round of 32**.
- **Knockout rounds:** Round of 32 → Round of 16 → Quarterfinals → Semifinals → Final
  (plus a Third-Place playoff). Ties: 30 min extra time (two 15-min halves) then penalties.

### 3.1 Group tiebreaker order (official, 2026)
When teams are level on points, rank by:
1. Head-to-head points
2. Head-to-head goal difference
3. Head-to-head goals scored
4. Overall goal difference
5. Overall goals scored
6. Team conduct score (fewer cards)
7. FIFA World Ranking

### 3.2 Best-third-place ranking (to select the 8 of 12)
Rank all 12 third-placed teams by: points → goal difference → goals scored →
team conduct score → FIFA World Ranking. Top 8 advance.

> **Note on data source:** actual standings/tiebreakers/qualifiers come from the
> **real results feed**, not computed by us, for the *official* bracket. We compute
> standings/tiebreakers only for each **user's predicted** table (Section 7). Both
> must implement the same rules so predictions and reality are comparable.

---

## 4. Scoring System

Defaults (stored per-league in `leagues.scoring_config` JSON; editable by commissioner — editor UI is Phase 2, defaults ship in Phase 1):

### Group stage — per match
| Outcome | Points |
|---|---|
| Exact scoreline | 5 |
| Correct result + correct goal difference | 3 |
| Correct result only (W/D/L) | 2 |
| Wrong | 0 |

### Qualification bonus — per group (settled when all 6 group matches final)
| Correct prediction | Points |
|---|---|
| Group winner | +3 |
| Each correct qualifier (top 2) | +2 |
| Correct best-3rd qualifier | +2 |

### Knockout — per correct advancer
| Round | Points |
|---|---|
| Round of 32 → R16 | 10 |
| Round of 16 → QF | 15 |
| Quarterfinal → SF | 25 |
| Semifinal → Final | 40 |
| Champion | 60 |
| Exact KO scoreline (bonus) | +3 |

**Rationale:** deeper rounds worth more → the title race stays alive to the Final.

---

## 5. Architecture

- **Frontend:** Next.js 15 (App Router) + React + TypeScript. Tailwind CSS design
  system. Framer Motion for game-feel animation. Built as an installable **PWA**.
- **Backend:** **Supabase** — Postgres, Auth (Google + Apple social login),
  Realtime (live updates), Row-Level Security.
- **Hosting:** **Vercel** — app, edge/route handlers, and a **Cron job** polling
  the results feed every few minutes.
- **Results feed:** a swappable **provider adapter** interface. Phase 1 implements a
  `football-data.org` adapter (free tier, covers the World Cup). Adapter normalizes
  to our internal match/result shape so providers can be swapped without app changes.
- **Client data:** Supabase JS client + TanStack Query for fetching/caching;
  Supabase Realtime subscriptions for live score & leaderboard updates.

### 5.1 Two loops
- **Predict loop:** user taps scores → upsert to `predictions` → predicted table
  re-sorts (spring animation) → row becomes read-only at `lock_at` (server-enforced).
- **Score loop:** Cron polls feed → finalized real result written to `matches` →
  scoring engine grades all predictions → `league_standings` recomputed → Realtime
  pushes → client fires celebration UI and reshuffles the leaderboard.

---

## 6. Data Model (core tables)

- **`teams`** — `id`, `code` (3-letter), `name`, `flag`, `group` (A–L), `fifa_rank`.
- **`matches`** — `id`, `stage` (`group`|`r32`|`r16`|`qf`|`sf`|`final`|`third`),
  `bracket_slot` (e.g. `W74`, `1A`, `2B`, best-3rd placeholder), `group` (nullable),
  `home_team_id`, `away_team_id` (nullable until bracket resolves), `kickoff_at`,
  `lock_at`, `status` (`scheduled`|`live`|`final`), `home_score`, `away_score`
  (actual results), `venue`, `winner_team_id` (resolved).
- **`profiles`** — `id` (= auth user), `display_name`, `avatar_url`.
- **`leagues`** — `id`, `name`, `invite_code`, `owner_id`, `scoring_config` (jsonb),
  `is_global` (bool).
- **`league_members`** — `league_id`, `user_id`, `joined_at`.
- **`predictions`** — `id`, `user_id`, `match_id`, `predicted_home`, `predicted_away`
  (group scorelines), `predicted_winner_team_id` (knockout advancer pick),
  `locked` (bool), `updated_at`. Unique on `(user_id, match_id)`.
- **`league_standings`** — `league_id`, `user_id`, `points`, `rank`,
  `exact_count`, `streak`, `updated_at` (read by realtime leaderboards).
- **`achievements`** (lightweight) — `user_id`, `badge_key`, `earned_at`.

Bracket structure for the knockout is encoded via `matches.bracket_slot` +
a slot-dependency map (which slots feed which), so the bracket can be rendered
and resolved deterministically.

---

## 7. Math Module (single source of truth)

One tested TypeScript module owns all competition math — used for **both** each
user's predicted standings and (where applicable) validating feed data:

- `computeGroupStandings(matches)` — points, GD, goals, applies the §3.1 tiebreaker
  order including head-to-head mini-tables.
- `rankThirdPlaceTeams(groups)` — applies §3.2 to pick the 8 best thirds.
- `resolveBracket(qualifiers, slotMap)` — fills R32 slots from real qualifiers.
- `scorePrediction(prediction, result, config)` — returns points per §4.

This module is **pure, deterministic, and unit-tested** — this is where "get the
math right" is enforced. TDD applies here especially.

---

## 8. Guided Gameplay Flow

1. **Onboard** — social login → set display name/avatar → create or join a league
   (invite code/link) or play solo in the global table.
2. **Predict groups** — swipeable group-by-group flow (A→L) with a "Group _n_ of 12"
   progress ring. Per group: enter all 6 scorelines; the predicted table re-sorts
   live. Already-kicked-off matches render locked with real results.
3. **Lock** — each match locks at its `lock_at` (= kickoff); server rejects late writes.
4. **Build bracket** — when the group stage is complete, R32 auto-fills with the real
   32 qualifiers (top 2 + 8 best thirds). User fills the entire bracket upfront to a
   champion. On mobile: a focused, swipeable tie-by-tie experience.
5. **Live scoring** — results roll in; points/leaderboards update in real time;
   celebration moments fire.
6. **Compete** — league + global leaderboards, personal rank, head-to-head vs friends.

---

## 9. Security & Correctness

- **RLS policies:**
  - `predictions`: a user may insert/update only their own rows, and only while
    `now() < matches.lock_at`. No edits after lock.
  - `matches` results: writable only by the service role (cron/admin); read-only to clients.
  - `league_standings`: readable only by members of that league (global league readable to all).
  - `league_members`: a user may join via valid invite code; sees only their leagues.
- **Lock enforcement** is server-side (RLS + `lock_at` check), never trusted from the client.
- **Math integrity:** Section 7 module is unit-tested against the §3/§4 rules.

---

## 10. Design System — "Broadcast Night, fun game"

- **Palette:** deep navy/charcoal gradients, gold (`#d4af37`/`#f4d56a`) accents,
  glassy translucent cards, neon-edged score inputs, success green for hits.
- **Game feel:** spring-animated table reshuffles; confetti + "BULLSEYE +5" toast on
  exact scores; streak counters; badges/achievements; rank-change motion (▲▼);
  group-completion progress rings; haptics on mobile; subtle sound (optional/muteable).
- **Mobile-first:** every screen designed for phone first; bracket is swipeable
  tie-by-tie on small screens, expands to full bracket on larger viewports.

---

## 11. Phase 2 (deferred — out of scope for v1)

The data model leaves room for all of these:
- **Push notifications** (web push via PWA service worker) — deadline & rank-change alerts.
- **Email** (Resend) — league invites, weekly recaps, deadline reminders.
- **Calendar** — downloadable `.ics` / "add to calendar" for match deadlines.
- **History/stats screens** — past predictions, accuracy charts, head-to-head history.
- **League scoring-config editor UI** (defaults already configurable in data in v1).

---

## 12. Open Items for Implementation Planning

- Confirm `football-data.org` free-tier coverage/limits for WC2026; define poll cadence
  and the cron schedule (respecting rate limits).
- Seed data: teams, groups, full 104-match schedule with venues, `kickoff_at`/`lock_at`.
- Exact social-login providers to enable first (Google + Apple proposed).
- Map of real-life group results already played as of launch (mid-tournament start).
