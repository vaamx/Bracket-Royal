# Bracket Royale — World Cup 2026 Predictions

A mobile-first PWA where friends predict every FIFA World Cup 2026 match, build a
full knockout bracket, and compete on a live leaderboard. Predictions are scored
against real match results. Aesthetic: "Broadcast Night" (deep navy + gold).

> **Status:** Phase 1 — Foundation. This branch contains the app scaffold, the
> Broadcast Night design system, the tested competition-math module, and the
> Supabase schema. Auth, the prediction UI, the live results feed/scoring, and the
> bracket UI are built in subsequent plans. See `docs/superpowers/`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase
(Postgres + Auth + Realtime) · Vitest. Deploys on Vercel.

## Prerequisites

- Node 20+
- Docker (for the local Supabase stack)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres + Auth + Studio).
#    Prints your local API URL, anon key, and service_role key.
npx supabase start

# 3. Apply the schema migration + dev seed to the local database
npx supabase db reset

# 4. Configure environment
cp .env.local.example .env.local
#    Paste the anon key + service_role key from `npx supabase start`
#    (or re-print them with `npx supabase status`) into .env.local

# 5. Run the app
npm run dev          # http://localhost:3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm test` | Run the Vitest unit suite (competition math) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint |

## Project layout

```
app/                  Next.js App Router pages + global styles
components/ui/         Reusable UI primitives (Card, Button)
lib/design/            Broadcast Night design tokens
lib/math/              Pure, tested competition math (standings, tiebreakers,
                       third-place ranking, prediction scoring) — no DB deps
lib/supabase/          Browser + server Supabase client helpers
supabase/              CLI config, schema migrations, dev seed
docs/superpowers/      Design spec + implementation plans
```

## The math module

`lib/math/` is the single source of truth for FIFA 2026 competition rules and is
fully unit-tested:

- `computeGroupStandings` — group tables with the official tiebreaker order
  (head-to-head first, recursive on still-tied subsets).
- `rankThirdPlaceTeams` — selects the 8 best third-placed teams.
- `scorePrediction` — 5 / 3 / 2 / 0 group scoring (league-configurable).

Run `npm test` to verify.
