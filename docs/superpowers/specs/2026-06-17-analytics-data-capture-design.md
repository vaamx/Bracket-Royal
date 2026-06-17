# Analytics & Identity Data Capture — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Author:** Victor Amaya (with Claude)

## Problem

The app mints a Supabase **anonymous** auth user in middleware
(`lib/supabase/middleware.ts:41`) on the first request from any browser with no
auth cookie — including a plain landing-page load. As a result, the user count
is badly inflated: of 451 `auth.users` rows, **441 are anonymous** (no email,
no provider) and only **10 are real email accounts**. Anonymous sessions are
unique *rows*, not unique *humans* (one person across devices/incognito, plus
bots/crawlers, each mint a new row).

Today the database captures almost nothing beyond `created_at`,
`last_sign_in_at`, `is_anonymous`, and email/provider. There is **no IP, no
geo, no device/user-agent, and no page/event tracking**; the built-in
`auth.audit_log_entries` table is empty. We therefore cannot distinguish real
humans from inflated sessions, cannot see the activation funnel, and cannot see
where users come from.

## Goals

1. **Count real humans** — de-inflate the numbers by deduplicating sessions
   (IP hash + device), separating bots from people.
2. **Behavior / funnel** — see the journey: land → start predicting → save a
   pick → (optionally) sign in → return; and where users drop off.
3. **Acquisition / geo** — country/city, referrer, UTM campaign, device,
   language.

### Definition of "activation"

Activation = a user has **saved at least one pick** (`predictions` or
`scorer_predictions`). Signing up is **not** required — an anonymous user who
saves a pick is activated. (Current activated base: 15 users = 7 anonymous +
8 real.)

## Non-goals (YAGNI)

- Full clickstream / every-click tracking.
- Session replay.
- Browser fingerprinting beyond IP + user-agent.
- A built-in analytics dashboard UI. This design delivers SQL/views; a UI is a
  separate later project.

## Decisions

| Decision | Choice |
|---|---|
| Where data lives | **Custom tables in Supabase** (queryable alongside app data; no third party). |
| IP storage | **Raw IP + derived geo + salted hash**, with a 90-day retention purge of the raw IP. |
| Geo source | **Vercel geolocation request headers** (`x-vercel-ip-country`, `-country-region`, `-city`) — free, no external geo-IP service. |
| `pick_saved` capture | **Postgres trigger** (picks are saved client-side, so the client can't be trusted to emit it). |

## Architecture

### Data model — migration `0011_analytics.sql`

**`analytics_sessions`** — one row per auth user (anonymous or real), enriched
with server-trusted data. Keyed by `user_id` so it maps 1:1 onto the existing
user rows and `count(distinct ip_hash)` estimates real humans.

```
id              uuid primary key default gen_random_uuid()
user_id         uuid not null unique references auth.users(id) on delete cascade
ip              inet                 -- raw; nulled after 90 days
ip_hash         text                 -- salted sha256(ip); retained (dedup)
country         text
region          text
city            text
user_agent      text
device          text                 -- mobile | desktop | tablet | bot
browser         text
os              text
is_bot          boolean default false
referrer        text
utm_source      text
utm_medium      text
utm_campaign    text
utm_term        text
utm_content     text
language        text                 -- EN/ES toggle or Accept-Language
first_seen_at   timestamptz not null default now()
last_seen_at    timestamptz not null default now()
```

**`analytics_events`** — append-only funnel stream.

```
id          bigint generated always as identity primary key
user_id     uuid not null references auth.users(id) on delete cascade
name        text not null            -- see event list below
props       jsonb default '{}'::jsonb
path        text
created_at  timestamptz not null default now()
```

**Event names:** `page_view`, `start_predicting`, `pick_saved`,
`scorer_saved`, `signed_in`. (Return visits are *derived* from `page_view`
timestamps against `first_seen_at`/`last_seen_at` — not a separate event.)

**Indexes:** `analytics_sessions(ip_hash)`, `analytics_sessions(country)`,
`analytics_events(name, created_at)`, `analytics_events(user_id)`.

### Capture points

| Signal | Location | Mechanism |
|---|---|---|
| Session row + IP/geo/UA/referrer/UTM + `last_seen_at` | `POST /api/track` (Node route), upsert by `user_id` | Node runtime has `node:crypto` for the salted hash and reads server-trusted IP/geo from request headers. **Middleware (`proxy.ts`) is left unchanged** — it still mints the anon user; a session row is created the first time a JS client pings `/api/track`. The gap between `auth.users` and `analytics_sessions` then itself measures no-JS / bot inflation. |
| `page_view` (+ derived return visits) | `POST /api/track` from the app layout on each load | Lightweight fire-and-forget. |
| `start_predicting` | `POST /api/track` from predict-page mount | Funnel step between landing and a saved pick. |
| `pick_saved` / `scorer_saved` | DB | `AFTER INSERT` trigger on `predictions` / `scorer_predictions` (`security definer`). Bulletproof — picks are saved client-side (`predict-client.tsx:68`, `bracket-client.tsx:85`). |
| `signed_in` | `app/auth/callback/route.ts` (Node) | Captures real sign-in and the anon→real upgrade (same `user_id`). |

> **Why `/api/track` instead of middleware:** the salted IP hash needs `node:crypto`, which is not guaranteed in the Edge runtime that `proxy.ts` may use; and keeping the critical auth middleware untouched minimizes risk. The trade-off — no-JS clients/bots get an `auth.users` row but no session row — is acceptable and actually useful (the count gap quantifies bot inflation).

### New / changed code

- `lib/analytics/context.ts` — **pure** helpers (no DB, no `server-only`):
  `contextFromHeaders(headers)` parses IP (`x-forwarded-for` / `x-real-ip`),
  geo (`x-vercel-ip-country` / `-country-region` / `-city`), UA (device /
  browser / os / is-bot heuristic), referrer, UTM params, language; and
  `hashIp(ip, salt)` (sha256, `node:crypto`). Unit-testable in isolation.
- `lib/analytics/track.ts` — `import "server-only"`; server-side writers
  `recordSession(userId, ctx)` (upsert by `user_id`, refreshing `last_seen_at`
  and backfilling null geo/UA) and `recordEvent(userId, name, props?, path?)`.
  Uses `createAdminClient()` (`lib/supabase/admin.ts`).
- `app/api/track/route.ts` — Node-runtime `POST` endpoint. Resolves the auth
  user from cookies (never trusts a client-sent id), builds the context from
  request headers, calls `recordSession` + `recordEvent`. Accepts
  `{ name, props?, path? }`.
- `lib/analytics/client.ts` — `"use client"` `track(name, props?)` helper:
  fire-and-forget `fetch('/api/track', …)`; never throws into the UI.
- `components/analytics/TrackPageViews.tsx` — client component mounted in the
  app layout; fires `page_view` on pathname change.
- `supabase/migrations/0011_analytics.sql` (+ `supabase/PROD_SETUP_0011.sql`,
  matching the repo's prod-apply convention) — the two tables, indexes, RLS,
  triggers, and the idempotent backfill.
- `app/auth/callback/route.ts` — emit `signed_in` after a successful sign-in.
- `app/(app)/predict/predict-client.tsx` — fire `start_predicting` on mount.
- `app/(app)/layout.tsx` — mount `<TrackPageViews/>`.
- `app/api/cron/purge-pii/route.ts` — retention job (below).
- `vercel.json` — one new cron entry.
- `.env.example` / `.env.local` — add `ANALYTICS_IP_SALT`.

`proxy.ts` / `lib/supabase/middleware.ts` are **not** modified.

## Privacy, retention & security

- **Retention:** `POST /api/cron/purge-pii` (guarded by `CRON_SECRET`, matching
  the existing `poll-results` / `notify` cron pattern) sets `ip = NULL` on
  `analytics_sessions` rows where `first_seen_at < now() - interval '90 days'`,
  retaining `ip_hash` + geo. Added to `vercel.json` crons (e.g. daily).
- **Salt:** `ANALYTICS_IP_SALT` env var so `ip_hash` is not a rainbow-table
  target. Added to `.env.example` / `.env.local`.
- **RLS:** enable RLS on both tables with **no policies** for `anon` /
  `authenticated`, so they are invisible to the Data API. Only the service role
  (middleware, `security definer` trigger, cron, analysis connection)
  reads/writes. This keeps PII locked down. Triggers are `security definer` and
  live in `public` but only write to analytics tables and take no untrusted
  input.
- **Consent (flag, not in scope):** IP + geo logging may require a consent
  notice depending on the audience's jurisdiction (GDPR/ePrivacy). This is a
  product decision to make separately; it does not change the build.

## Metrics unlocked (example queries)

- **Real humans:** `select count(distinct ip_hash) filter (where not is_bot)
  from analytics_sessions;` vs `count(*)` → inflation factor.
- **Funnel:** sessions → `start_predicting` → `pick_saved` → `signed_in`, with
  per-step drop-off.
- **Activation:** distinct `user_id` with a `pick_saved` event (anonymous
  included).
- **Acquisition:** breakdowns by `country`/`city`, `referrer`, `utm_*`,
  `device`, `language`.
- **Bot rate** and multi-anon-per-`ip_hash` clusters.

## Rollout

1. Apply migration `0011_analytics.sql` (tables, indexes, RLS, triggers) +
   idempotent backfill.
2. Add `ANALYTICS_IP_SALT` to env.
3. Ship `lib/analytics/context.ts`, `lib/analytics/track.ts`,
   `app/api/track/route.ts`.
4. Emit `signed_in` from the auth callback.
5. Add client `page_view` (app layout) + `start_predicting` (predict mount)
   pings via `lib/analytics/client.ts`.
6. Add `purge-pii` cron + `vercel.json` entry.
7. **Backfill (confirmed):** session rows for existing 451 users have no IP/geo
   history (forward-looking only), but `pick_saved` / `scorer_saved` events
   **are** backfilled from existing `predictions` / `scorer_predictions` rows so
   the funnel isn't empty on day one. Done **carefully**:
   - Idempotent — guard with a uniqueness key (e.g. partial unique index on
     `analytics_events(user_id, name, (props->>'match_id'))` for the backfilled
     event names, or a `not exists` check) so re-running the migration cannot
     double-insert.
   - Use `predictions.updated_at` as the event `created_at` (best available
     timestamp; flag in `props` that the row is backfilled, e.g.
     `props: {backfilled: true, match_id: ...}`).
   - `scorer_predictions` has `created_at`; use it directly.
   - Run as a single set-based `INSERT ... SELECT`, after the trigger is created,
     so going-forward picks and historical picks use the same event shape.

## Open questions / product follow-ups

- Consent notice (jurisdiction-dependent) — **product decision, out of build
  scope** (confirmed).
- Raw-IP retention window confirmed at **90 days**.
- **Accepted known-minor:** the proxy matcher covers `/api/track`, so a
  cookieless POST to it mints an anonymous `auth.users` row (the route then
  204s and writes no analytics). This is a marginal, self-inflicted addition to
  the inflation metric, of the same class as a bot hitting any page. Owner
  decision (2026-06-17): accept as-is — `proxy.ts` stays untouched; impact is
  negligible (bots target pages, not a JSON API).
