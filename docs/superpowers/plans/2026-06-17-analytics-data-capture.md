# Analytics & Identity Data Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture sessions, IP/geo, device, acquisition (referrer/UTM), and a funnel event stream into custom Supabase tables so we can count real humans, see the activation funnel, and see where users come from.

**Architecture:** A migration adds `analytics_sessions` + `analytics_events` (RLS-locked, service-role only). A pure header-parsing module (`context.ts`) feeds server-side writers (`track.ts`) that go through a `security definer` `record_session` RPC (first-touch acquisition, last-seen refresh) and a direct event insert. A Node `/api/track` route receives client `page_view` / `start_predicting` pings; DB triggers capture `pick_saved` / `scorer_saved`; the auth callback emits `signed_in`. A `CRON_SECRET`-guarded cron nulls raw IPs after 90 days.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts` middleware — left untouched), Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest (unit `*.test.ts` + live-DB integration `*.itest.ts`), Vercel cron.

## Global Constraints

- **App/runtime code uses `@supabase/supabase-js` / `@supabase/ssr` only.** `pg` is a transitive dep, NOT declared — never `import "pg"` in committed app code (it's fine in the dev-only `_wc_sql.mjs` analysis helper).
- **Service-role client** comes from `createAdminClient()` in `lib/supabase/admin.ts` (`import "server-only"`); never expose it to the client.
- **RLS:** both new tables have RLS enabled and **no `anon`/`authenticated` policies or grants** — they must be invisible to the Data API. Only `service_role` (and `security definer` functions) read/write.
- **`SECURITY DEFINER` functions** must `set search_path = public` and have `execute` **revoked from `public, anon, authenticated`** and granted only to `service_role`.
- **Activation = a saved pick** (`predictions` or `scorer_predictions`), anonymous included. Sign-up is not required.
- **IP storage:** raw `ip` (purged after 90 days) + derived geo + salted `ip_hash` (retained). Salt is `process.env.ANALYTICS_IP_SALT`.
- **Geo source:** Vercel headers `x-vercel-ip-country`, `x-vercel-ip-country-region`, `x-vercel-ip-city` (no external geo-IP service).
- **No new runtime dependencies.** UA parsing is a small in-repo heuristic, not a library.
- **Integration tests hit the live cloud DB** (`.env.local`). Use unique identifiers per run and clean up created users in `afterAll` (cascades remove analytics rows).
- **Migration apply:** the repo has no CLI link; apply SQL via the Supabase SQL editor using `supabase/PROD_SETUP_0011.sql` (the established prod-apply convention), and keep `supabase/migrations/0011_analytics.sql` as the tracked migration.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `supabase/migrations/0011_analytics.sql` (create) — tables, indexes, RLS, `record_session` RPC, log triggers, idempotent backfill.
- `supabase/PROD_SETUP_0011.sql` (create) — identical SQL for prod apply.
- `lib/analytics/context.ts` (create) — pure header parsing + `hashIp`. No DB.
- `lib/analytics/context.test.ts` (create) — unit tests.
- `lib/analytics/track.ts` (create) — `recordSession`, `recordEvent`, `purgeExpiredIps`.
- `lib/analytics/track.itest.ts` (create) — live-DB integration tests for the writers, triggers, and purge.
- `test/stubs/server-only.ts` (create) + `vitest.integration.config.ts` (modify) — alias `server-only` so server modules import cleanly under Vitest.
- `lib/analytics/client.ts` (create) — `"use client"` fire-and-forget `track()`.
- `components/analytics/TrackPageViews.tsx` (create) — client component, fires `page_view` on path change.
- `app/api/track/route.ts` (create) — Node POST endpoint.
- `app/api/cron/purge-pii/route.ts` (create) — retention cron.
- `app/layout.tsx` (modify) — mount `<TrackPageViews/>` (root layout, so landing `app/page.tsx` and all pages are covered).
- `app/(app)/predict/predict-client.tsx` (modify) — fire `start_predicting` on mount.
- `app/auth/callback/route.ts` (modify) — emit `signed_in`.
- `vercel.json` (modify) — add purge-pii cron.
- `.env.example`, `.env.local` (modify) — add `ANALYTICS_IP_SALT`.

---

### Task 1: Database schema, RPC, triggers, and idempotent backfill

**Files:**
- Create: `supabase/migrations/0011_analytics.sql`
- Create: `supabase/PROD_SETUP_0011.sql` (identical content)
- Test: `lib/analytics/track.itest.ts` (created here; expanded in Task 3)

**Interfaces:**
- Produces (SQL surface consumed by later tasks):
  - tables `public.analytics_sessions(user_id uuid unique, ip inet, ip_hash text, country/region/city text, user_agent text, device text, browser text, os text, is_bot boolean, referrer text, utm_source/medium/campaign/term/content text, language text, first_seen_at timestamptz, last_seen_at timestamptz)` and `public.analytics_events(id bigint identity, user_id uuid, name text, props jsonb, path text, created_at timestamptz)`
  - RPC `public.record_session(p_user_id uuid, p_ip inet, p_ip_hash text, p_country text, p_region text, p_city text, p_user_agent text, p_device text, p_browser text, p_os text, p_is_bot boolean, p_referrer text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_term text, p_utm_content text, p_language text) returns void`
  - triggers writing `analytics_events.name` values `pick_saved` (props `{match_id}`) and `scorer_saved` (props `{player_id}`)

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0011_analytics.sql`:

```sql
-- 0011: analytics — sessions + event funnel for de-inflating user counts,
-- behavior/funnel, and acquisition/geo. RLS-locked: service-role only.
-- Activation = a saved pick (anonymous included), captured via triggers.

create table if not exists public.analytics_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  ip            inet,                       -- raw; nulled after 90 days
  ip_hash       text,                       -- salted sha256(ip); retained (dedup)
  country       text,
  region        text,
  city          text,
  user_agent    text,
  device        text,                       -- mobile | tablet | desktop | bot
  browser       text,
  os            text,
  is_bot        boolean not null default false,
  referrer      text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_term      text,
  utm_content   text,
  language      text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,                 -- page_view | start_predicting | pick_saved | scorer_saved | signed_in
  props      jsonb not null default '{}'::jsonb,
  path       text,
  created_at timestamptz not null default now()
);

create index if not exists analytics_sessions_ip_hash_idx on public.analytics_sessions (ip_hash);
create index if not exists analytics_sessions_country_idx on public.analytics_sessions (country);
create index if not exists analytics_events_name_time_idx on public.analytics_events (name, created_at desc);
create index if not exists analytics_events_user_idx on public.analytics_events (user_id);

-- RLS: enabled with NO anon/authenticated policies → invisible to the Data API.
alter table public.analytics_sessions enable row level security;
alter table public.analytics_events  enable row level security;

-- Lock down table privileges: only service_role. Revoke any default grants.
revoke all on public.analytics_sessions from anon, authenticated;
revoke all on public.analytics_events  from anon, authenticated;
grant select, insert, update, delete on public.analytics_sessions to service_role;
grant select, insert, update, delete on public.analytics_events  to service_role;

-- Upsert a session row: first-touch acquisition/geo preserved, last_seen refreshed,
-- IP refreshed to the latest seen value.
create or replace function public.record_session(
  p_user_id uuid, p_ip inet, p_ip_hash text, p_country text, p_region text, p_city text,
  p_user_agent text, p_device text, p_browser text, p_os text, p_is_bot boolean,
  p_referrer text, p_utm_source text, p_utm_medium text, p_utm_campaign text,
  p_utm_term text, p_utm_content text, p_language text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analytics_sessions as s (
    user_id, ip, ip_hash, country, region, city, user_agent, device, browser, os,
    is_bot, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    language, first_seen_at, last_seen_at
  ) values (
    p_user_id, p_ip, p_ip_hash, p_country, p_region, p_city, p_user_agent, p_device, p_browser, p_os,
    coalesce(p_is_bot, false), p_referrer, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_term, p_utm_content,
    p_language, now(), now()
  )
  on conflict (user_id) do update set
    last_seen_at = now(),
    ip           = coalesce(excluded.ip, s.ip),
    ip_hash      = coalesce(excluded.ip_hash, s.ip_hash),
    country      = coalesce(s.country, excluded.country),
    region       = coalesce(s.region, excluded.region),
    city         = coalesce(s.city, excluded.city),
    user_agent   = coalesce(s.user_agent, excluded.user_agent),
    device       = coalesce(s.device, excluded.device),
    browser      = coalesce(s.browser, excluded.browser),
    os           = coalesce(s.os, excluded.os),
    referrer     = coalesce(s.referrer, excluded.referrer),
    utm_source   = coalesce(s.utm_source, excluded.utm_source),
    utm_medium   = coalesce(s.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(s.utm_campaign, excluded.utm_campaign),
    utm_term     = coalesce(s.utm_term, excluded.utm_term),
    utm_content  = coalesce(s.utm_content, excluded.utm_content),
    language     = coalesce(s.language, excluded.language);
end $$;

revoke execute on function public.record_session(uuid, inet, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_session(uuid, inet, text, text, text, text, text, text, text, text, boolean, text, text, text, text, text, text, text) to service_role;

-- Funnel triggers: a saved pick is an activation signal. AFTER INSERT only —
-- editing an existing pick is an UPDATE (no new event). NOTE: we deliberately do
-- NOT add a unique index on (user_id, name, match_id): bracket-client deletes and
-- re-inserts removed picks, which would re-fire INSERT; a unique constraint would
-- make that prediction insert fail. Duplicate pick_saved rows are acceptable
-- (distinct-user activation counts are unaffected).
create or replace function public.log_pick_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.analytics_events (user_id, name, props)
  values (new.user_id, 'pick_saved', jsonb_build_object('match_id', new.match_id));
  return new;
end $$;

create or replace function public.log_scorer_saved() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.analytics_events (user_id, name, props)
  values (new.user_id, 'scorer_saved', jsonb_build_object('player_id', new.player_id));
  return new;
end $$;

drop trigger if exists trg_predictions_log_pick on public.predictions;
create trigger trg_predictions_log_pick
  after insert on public.predictions
  for each row execute function public.log_pick_saved();

drop trigger if exists trg_scorer_log_pick on public.scorer_predictions;
create trigger trg_scorer_log_pick
  after insert on public.scorer_predictions
  for each row execute function public.log_scorer_saved();

-- Idempotent backfill of existing picks so the funnel isn't empty on day one.
-- `not exists` guard makes a re-run a no-op. predictions has no created_at, so
-- updated_at is the best available timestamp; flag rows as backfilled.
insert into public.analytics_events (user_id, name, props, created_at)
select p.user_id, 'pick_saved',
       jsonb_build_object('match_id', p.match_id, 'backfilled', true),
       coalesce(p.updated_at, now())
from public.predictions p
where not exists (
  select 1 from public.analytics_events e
  where e.user_id = p.user_id and e.name = 'pick_saved'
    and e.props->>'match_id' = p.match_id
);

insert into public.analytics_events (user_id, name, props, created_at)
select sp.user_id, 'scorer_saved',
       jsonb_build_object('player_id', sp.player_id, 'backfilled', true),
       coalesce(sp.created_at, now())
from public.scorer_predictions sp
where not exists (
  select 1 from public.analytics_events e
  where e.user_id = sp.user_id and e.name = 'scorer_saved'
    and e.props->>'player_id' = sp.player_id
);
```

- [ ] **Step 2: Copy the SQL to the prod-setup file**

Create `supabase/PROD_SETUP_0011.sql` with the **exact same content** as `supabase/migrations/0011_analytics.sql` (the repo applies prod schema by pasting `PROD_SETUP_*.sql` into the Supabase SQL editor).

- [ ] **Step 3: Apply the migration to the database**

Paste the contents of `supabase/PROD_SETUP_0011.sql` into the Supabase SQL editor for project `zqdmnkycgbdcazamnhms` and run it. (It is idempotent — safe to re-run.)

- [ ] **Step 4: Verify the schema landed (read-only)**

Run:
```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});(async()=>{for(const t of ['analytics_sessions','analytics_events']){const r=await a.from(t).select('*',{count:'exact',head:true});console.log(t, r.error?('ERR '+r.error.message):('OK count='+r.count));}const b=await a.from('analytics_events').select('*',{count:'exact',head:true}).eq('name','pick_saved');console.log('backfilled pick_saved count=', b.count);})()"
```
Expected: `analytics_sessions OK count=0`, `analytics_events OK count=...`, and `backfilled pick_saved count=` a number > 0 (matches existing predictions, ~497).

- [ ] **Step 5: Verify anon cannot read the tables (RLS/grants)**

Run:
```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});a.from('analytics_sessions').select('id').then(r=>console.log('anon read sessions ->', r.error?('blocked: '+r.error.code):('LEAKED rows='+(r.data?.length))))"
```
Expected: `anon read sessions -> blocked: 42501` (permission denied). It must NOT print `LEAKED`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0011_analytics.sql supabase/PROD_SETUP_0011.sql
git commit -m "feat(analytics): schema, record_session RPC, pick triggers, backfill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pure context parsing (`lib/analytics/context.ts`)

**Files:**
- Create: `lib/analytics/context.ts`
- Test: `lib/analytics/context.test.ts`

**Interfaces:**
- Produces:
  - `type Utm = { source: string|null; medium: string|null; campaign: string|null; term: string|null; content: string|null }`
  - `type AnalyticsContext = { ip: string|null; ipHash: string|null; country: string|null; region: string|null; city: string|null; userAgent: string|null; device: "mobile"|"tablet"|"desktop"|"bot"; browser: string|null; os: string|null; isBot: boolean; referrer: string|null; utm: Utm; language: string|null }`
  - `hashIp(ip: string, salt: string): string`
  - `parseUserAgent(ua: string|null): { device; browser: string|null; os: string|null; isBot: boolean }`
  - `contextFromHeaders(headers: Headers, salt?: string): AnalyticsContext`

- [ ] **Step 1: Write the failing unit test**

Create `lib/analytics/context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hashIp, parseUserAgent, contextFromHeaders } from "@/lib/analytics/context";

describe("hashIp", () => {
  it("is deterministic and salt-dependent", () => {
    expect(hashIp("1.2.3.4", "s")).toBe(hashIp("1.2.3.4", "s"));
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.4", "other"));
    expect(hashIp("1.2.3.4", "s")).toHaveLength(64); // sha256 hex
  });
});

describe("parseUserAgent", () => {
  it("flags bots", () => {
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").isBot).toBe(true);
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").device).toBe("bot");
  });
  it("detects mobile + iOS + Safari", () => {
    const r = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1");
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("iOS");
  });
  it("defaults to desktop with no UA", () => {
    expect(parseUserAgent(null)).toEqual({ device: "desktop", browser: null, os: null, isBot: false });
  });
});

describe("contextFromHeaders", () => {
  it("parses IP, geo, UA, and language; hashes IP when salt given", () => {
    const h = new Headers({
      "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "TX",
      "x-vercel-ip-city": "San%20Antonio",
      "user-agent": "Mozilla/5.0 (iPhone) Safari",
      "accept-language": "es-MX,es;q=0.9",
    });
    const ctx = contextFromHeaders(h, "salt");
    expect(ctx.ip).toBe("9.9.9.9");           // first hop only
    expect(ctx.ipHash).toBe(hashIp("9.9.9.9", "salt"));
    expect(ctx.country).toBe("US");
    expect(ctx.region).toBe("TX");
    expect(ctx.city).toBe("San Antonio");     // URL-decoded
    expect(ctx.device).toBe("mobile");
    expect(ctx.language).toBe("es-MX");
  });
  it("yields null ipHash when no IP", () => {
    expect(contextFromHeaders(new Headers(), "salt").ipHash).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/analytics/context.test.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/context`.

- [ ] **Step 3: Implement `context.ts`**

Create `lib/analytics/context.ts`:

```ts
import crypto from "node:crypto";

export type Utm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
};

export type AnalyticsContext = {
  ip: string | null;
  ipHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
  device: "mobile" | "tablet" | "desktop" | "bot";
  browser: string | null;
  os: string | null;
  isBot: boolean;
  referrer: string | null;
  utm: Utm;
  language: string | null;
};

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|preview|headless|monitoring|pingdom|lighthouse|gtmetrix|axios|curl|wget|python-requests|node-fetch/i;

export function parseUserAgent(ua: string | null): {
  device: AnalyticsContext["device"];
  browser: string | null;
  os: string | null;
  isBot: boolean;
} {
  if (!ua) return { device: "desktop", browser: null, os: null, isBot: false };
  const isBot = BOT_RE.test(ua);
  const device: AnalyticsContext["device"] = isBot
    ? "bot"
    : /ipad|tablet/i.test(ua)
      ? "tablet"
      : /mobile|iphone|android/i.test(ua)
        ? "mobile"
        : "desktop";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : null;
  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad|ios|ipod/i.test(ua)
      ? "iOS"
      : /mac os/i.test(ua)
        ? "macOS"
        : /android/i.test(ua)
          ? "Android"
          : /linux/i.test(ua)
            ? "Linux"
            : null;
  return { device, browser, os, isBot };
}

function safeDecode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function contextFromHeaders(headers: Headers, salt?: string): AnalyticsContext {
  const theSalt = salt ?? process.env.ANALYTICS_IP_SALT ?? "";
  const fwd = headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0]?.trim() || headers.get("x-real-ip") || "").trim() || null;
  const ua = headers.get("user-agent");
  const { device, browser, os, isBot } = parseUserAgent(ua);
  return {
    ip,
    ipHash: ip && theSalt ? hashIp(ip, theSalt) : null,
    country: headers.get("x-vercel-ip-country"),
    region: headers.get("x-vercel-ip-country-region"),
    city: safeDecode(headers.get("x-vercel-ip-city")),
    userAgent: ua,
    device,
    browser,
    os,
    isBot,
    referrer: headers.get("referer"),
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    language: (headers.get("accept-language") || "").split(",")[0]?.trim() || null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/analytics/context.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/context.ts lib/analytics/context.test.ts
git commit -m "feat(analytics): pure header/context parsing with unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server-side writers (`lib/analytics/track.ts`)

**Files:**
- Create: `lib/analytics/track.ts`
- Create: `test/stubs/server-only.ts` (empty stub)
- Modify: `vitest.integration.config.ts` (alias `server-only` → stub)
- Test: `lib/analytics/track.itest.ts`

**Interfaces:**
- Consumes: `AnalyticsContext` from `lib/analytics/context.ts`; `createAdminClient()` from `lib/supabase/admin.ts`; RPC `record_session` and tables from Task 1.
- Produces:
  - `recordSession(userId: string, ctx: AnalyticsContext): Promise<void>`
  - `recordEvent(userId: string, name: string, props?: Record<string, unknown>, path?: string | null): Promise<void>`
  - `purgeExpiredIps(olderThanDays?: number): Promise<number>`

- [ ] **Step 1: Stub `server-only` for the integration runner**

`track.ts` imports `createAdminClient()` from `lib/supabase/admin.ts`, which does
`import "server-only"`. That package **throws** when resolved under Vitest's node
environment (it only no-ops under the bundler `react-server` condition), which is
why the repo's existing `.itest.ts` files build their client inline. Alias it to
an empty stub for the integration run.

Create `test/stubs/server-only.ts`:

```ts
// Empty stub: `server-only` throws when imported outside a React Server
// Component bundle. Aliased in vitest.integration.config.ts so server modules
// (e.g. lib/supabase/admin.ts) can be imported by integration tests.
export {};
```

In `vitest.integration.config.ts`, change the resolve block from:

```ts
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
```

to:

```ts
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "test/stubs/server-only.ts"),
    },
  },
```

- [ ] **Step 2: Write the failing integration test**

Create `lib/analytics/track.itest.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordSession, recordEvent, purgeExpiredIps } from "@/lib/analytics/track";
import type { AnalyticsContext } from "@/lib/analytics/context";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ctx = (over: Partial<AnalyticsContext> = {}): AnalyticsContext => ({
  ip: "203.0.113.7",
  ipHash: "hash-abc",
  country: "US",
  region: "TX",
  city: "Austin",
  userAgent: "Mozilla/5.0 (iPhone) Safari",
  device: "mobile",
  browser: "Safari",
  os: "iOS",
  isBot: false,
  referrer: "https://t.co/x",
  utm: { source: "twitter", medium: "social", campaign: "launch", term: null, content: null },
  language: "es-MX",
  ...over,
});

describe("analytics writers (integration)", () => {
  let userId: string;

  beforeAll(async () => {
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;
    const { data, error } = await admin.auth.admin.createUser({
      email: `analytics-${stamp}@example.com`,
      password: "Password123!",
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId); // cascades to analytics rows
  });

  it("recordSession upserts a session row (first-touch acquisition preserved)", async () => {
    await recordSession(userId, ctx());
    await recordSession(userId, ctx({ referrer: null, utm: { source: null, medium: null, campaign: null, term: null, content: null } }));
    const { data } = await admin.from("analytics_sessions").select("*").eq("user_id", userId).single();
    expect(data?.country).toBe("US");
    expect(data?.utm_source).toBe("twitter"); // not wiped by the second (null) ping
    expect(data?.device).toBe("mobile");
  });

  it("recordEvent inserts an event row", async () => {
    await recordEvent(userId, "start_predicting", { from: "test" }, "/predict");
    const { data } = await admin
      .from("analytics_events")
      .select("name, path, props")
      .eq("user_id", userId)
      .eq("name", "start_predicting");
    expect(data?.length).toBe(1);
    expect(data?.[0]?.path).toBe("/predict");
  });

  it("the predictions trigger logs a pick_saved event", async () => {
    const { data: match } = await admin.from("matches").select("id").limit(1).single();
    await admin.from("predictions").insert({
      user_id: userId,
      match_id: match!.id,
      predicted_home: 1,
      predicted_away: 0,
    });
    const { data } = await admin
      .from("analytics_events")
      .select("props")
      .eq("user_id", userId)
      .eq("name", "pick_saved");
    expect((data?.length ?? 0)).toBeGreaterThanOrEqual(1);
    expect(data?.some((e) => (e.props as Record<string, unknown>).match_id === match!.id)).toBe(true);
  });

  it("purgeExpiredIps nulls raw IP on old rows but keeps ip_hash", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    await admin.from("analytics_sessions").update({ first_seen_at: old }).eq("user_id", userId);
    const purged = await purgeExpiredIps(90);
    expect(purged).toBeGreaterThanOrEqual(1);
    const { data } = await admin.from("analytics_sessions").select("ip, ip_hash").eq("user_id", userId).single();
    expect(data?.ip).toBeNull();
    expect(data?.ip_hash).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config vitest.integration.config.ts lib/analytics/track.itest.ts`
Expected: FAIL — cannot resolve `@/lib/analytics/track`.

- [ ] **Step 4: Implement `track.ts`**

Create `lib/analytics/track.ts`:

```ts
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnalyticsContext } from "@/lib/analytics/context";

export async function recordSession(userId: string, ctx: AnalyticsContext): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_session", {
    p_user_id: userId,
    p_ip: ctx.ip,
    p_ip_hash: ctx.ipHash,
    p_country: ctx.country,
    p_region: ctx.region,
    p_city: ctx.city,
    p_user_agent: ctx.userAgent,
    p_device: ctx.device,
    p_browser: ctx.browser,
    p_os: ctx.os,
    p_is_bot: ctx.isBot,
    p_referrer: ctx.referrer,
    p_utm_source: ctx.utm.source,
    p_utm_medium: ctx.utm.medium,
    p_utm_campaign: ctx.utm.campaign,
    p_utm_term: ctx.utm.term,
    p_utm_content: ctx.utm.content,
    p_language: ctx.language,
  });
  if (error) console.error("recordSession failed:", error.message);
}

export async function recordEvent(
  userId: string,
  name: string,
  props: Record<string, unknown> = {},
  path: string | null = null
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("analytics_events").insert({ user_id: userId, name, props, path });
  if (error) console.error("recordEvent failed:", error.message);
}

export async function purgeExpiredIps(olderThanDays = 90): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const { data, error } = await admin
    .from("analytics_sessions")
    .update({ ip: null })
    .lt("first_seen_at", cutoff)
    .not("ip", "is", null)
    .select("user_id");
  if (error) {
    console.error("purgeExpiredIps failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config vitest.integration.config.ts lib/analytics/track.itest.ts`
Expected: PASS (4 tests). If `matches` is empty in your env, the trigger test will error fetching a match — ensure match data is seeded first.

- [ ] **Step 6: Commit**

```bash
git add lib/analytics/track.ts lib/analytics/track.itest.ts test/stubs/server-only.ts vitest.integration.config.ts
git commit -m "feat(analytics): server writers (recordSession/recordEvent/purgeExpiredIps) + itests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `/api/track` route, client helper, page-view + start_predicting wiring

**Files:**
- Create: `app/api/track/route.ts`
- Create: `lib/analytics/client.ts`
- Create: `components/analytics/TrackPageViews.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/(app)/predict/predict-client.tsx`

**Interfaces:**
- Consumes: `contextFromHeaders` (Task 2); `recordSession`, `recordEvent` (Task 3); `createClient` from `lib/supabase/server.ts`.
- Produces: `track(name: string, props?: Record<string, unknown>): void` (client); component `TrackPageViews`.

- [ ] **Step 1: Implement the `/api/track` route**

Create `app/api/track/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contextFromHeaders } from "@/lib/analytics/context";
import { recordSession, recordEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only these names may be sent by the browser. signed_in / pick_saved are emitted
// server-side or by triggers and must never be spoofable from the client.
const CLIENT_EVENTS = new Set(["page_view", "start_predicting"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!CLIENT_EVENTS.has(name)) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const ctx = contextFromHeaders(request.headers);
  if (typeof body.referrer === "string") ctx.referrer = body.referrer;
  if (typeof body.language === "string") ctx.language = body.language;
  const utm = body.utm as Record<string, unknown> | undefined;
  if (utm && typeof utm === "object") {
    ctx.utm = {
      source: typeof utm.source === "string" ? utm.source : null,
      medium: typeof utm.medium === "string" ? utm.medium : null,
      campaign: typeof utm.campaign === "string" ? utm.campaign : null,
      term: typeof utm.term === "string" ? utm.term : null,
      content: typeof utm.content === "string" ? utm.content : null,
    };
  }
  const path = typeof body.path === "string" ? body.path : null;
  const props = body.props && typeof body.props === "object" ? (body.props as Record<string, unknown>) : {};

  await recordSession(user.id, ctx);
  await recordEvent(user.id, name, props, path);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Implement the client helper**

Create `lib/analytics/client.ts`:

```ts
"use client";

type Props = Record<string, unknown>;

function readUtm(): Record<string, string | null> {
  const p = new URLSearchParams(window.location.search);
  return {
    source: p.get("utm_source"),
    medium: p.get("utm_medium"),
    campaign: p.get("utm_campaign"),
    term: p.get("utm_term"),
    content: p.get("utm_content"),
  };
}

/** Fire-and-forget analytics ping. Never throws into the UI. */
export function track(name: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      name,
      props,
      path: window.location.pathname,
      referrer: document.referrer || null,
      language: navigator.language || null,
      utm: readUtm(),
    });
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never break the UI for analytics */
  }
}
```

- [ ] **Step 3: Implement the page-view component**

Create `components/analytics/TrackPageViews.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/client";

/** Fires a page_view (and refreshes last_seen) on every path change. Renders nothing. */
export function TrackPageViews() {
  const pathname = usePathname();
  useEffect(() => {
    track("page_view", {});
  }, [pathname]);
  return null;
}
```

- [ ] **Step 4: Mount the page-view component in the root layout**

Use the **root** layout (`app/layout.tsx`), not `app/(app)/layout.tsx`, so the
landing page (`app/page.tsx`, outside the `(app)` route group) and every other
page are covered.

In `app/layout.tsx`, add the import after the existing imports (after the
`I18nProvider` import):

```tsx
import { TrackPageViews } from "@/components/analytics/TrackPageViews";
```

Then mount it inside `<body>`, before the provider. Change:

```tsx
      <body className="min-h-full flex flex-col">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
```

to:

```tsx
      <body className="min-h-full flex flex-col">
        <TrackPageViews />
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
```

- [ ] **Step 5: Fire `start_predicting` on the predict page**

In `app/(app)/predict/predict-client.tsx`:

Change the React import on line 3 from:

```tsx
import { useCallback, useMemo, useRef, useState } from "react";
```

to:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

Add the import near the other `@/lib` imports:

```tsx
import { track } from "@/lib/analytics/client";
```

Then, immediately after the state declarations inside `PredictClient` (after the line `const pending = useRef(0);`), add:

```tsx
  // Funnel: entering the prediction flow. Fires once per mount.
  useEffect(() => {
    track("start_predicting", {});
  }, []);
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual smoke test (route + wiring)**

Route handlers aren't unit-tested in this repo (they depend on the Next request/cookie runtime), so verify manually:

1. Start the dev server: `npm run dev`
2. In a fresh browser profile, open `http://localhost:3000/?utm_source=demo&utm_campaign=smoke`
3. Navigate to the predict page.
4. Confirm rows landed:
```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});(async()=>{const s=await a.from('analytics_sessions').select('utm_source,country,device').order('last_seen_at',{ascending:false}).limit(1);console.log('latest session:', s.data?.[0]);const e=await a.from('analytics_events').select('name').order('created_at',{ascending:false}).limit(5);console.log('recent events:', e.data?.map(x=>x.name));})()"
```
Expected: latest session shows `utm_source: "demo"`; recent events include `page_view` and `start_predicting`. (Locally, `country`/`device` may be null/desktop — Vercel geo headers only exist in deployed environments.)

- [ ] **Step 8: Commit**

```bash
git add app/api/track/route.ts lib/analytics/client.ts components/analytics/TrackPageViews.tsx app/layout.tsx "app/(app)/predict/predict-client.tsx"
git commit -m "feat(analytics): /api/track route + client page_view & start_predicting

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Emit `signed_in` from the auth callback

**Files:**
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `contextFromHeaders` (Task 2); `recordSession`, `recordEvent` (Task 3).

- [ ] **Step 1: Add the analytics imports**

In `app/auth/callback/route.ts`, after the existing import of `createClient`:

```ts
import { contextFromHeaders } from "@/lib/analytics/context";
import { recordSession, recordEvent } from "@/lib/analytics/track";
```

- [ ] **Step 2: Add a helper that records the sign-in**

Add this function above `export async function GET` in the same file:

```ts
/** Best-effort sign-in analytics; never blocks or breaks the redirect. */
async function logSignIn(request: Request, supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await recordSession(user.id, contextFromHeaders(request.headers));
    await recordEvent(user.id, "signed_in", {}, "/auth/callback");
  } catch (e) {
    console.error("logSignIn failed:", e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 3: Call it on each successful sign-in path**

In `GET`, change the `code` success branch from:

```ts
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
```

to:

```ts
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

And change the `tokenHash` success branch from:

```ts
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
```

to:

```ts
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat(analytics): emit signed_in on auth callback success

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Retention cron (`purge-pii`)

**Files:**
- Create: `app/api/cron/purge-pii/route.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `purgeExpiredIps` (Task 3). (Already integration-tested in Task 3.)

- [ ] **Step 1: Implement the cron route**

Create `app/api/cron/purge-pii/route.ts`:

```ts
import { NextResponse } from "next/server";
import { purgeExpiredIps } from "@/lib/analytics/track";

export const dynamic = "force-dynamic";

/** CRON_SECRET-guarded retention: nulls raw IPs older than 90 days (keeps ip_hash + geo). */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const purged = await purgeExpiredIps(90);
    return NextResponse.json({ purged });
  } catch (e) {
    const message = e instanceof Error ? e.message : "purge failed";
    console.error("cron/purge-pii failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Register the cron in `vercel.json`**

Change `vercel.json` from:

```json
{
  "crons": [
    { "path": "/api/cron/poll-results", "schedule": "0 7 * * *" },
    { "path": "/api/cron/notify", "schedule": "0 13 * * *" }
  ]
}
```

to:

```json
{
  "crons": [
    { "path": "/api/cron/poll-results", "schedule": "0 7 * * *" },
    { "path": "/api/cron/notify", "schedule": "0 13 * * *" },
    { "path": "/api/cron/purge-pii", "schedule": "0 4 * * *" }
  ]
}
```

- [ ] **Step 3: Verify the guard rejects unauthorized calls**

Run: `npm run dev` then in another shell:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/purge-pii
```
Expected: `401`.

Then with the secret (replace `$SECRET` with the value of `CRON_SECRET` in `.env.local`):
```bash
curl -s -H "authorization: Bearer $SECRET" http://localhost:3000/api/cron/purge-pii
```
Expected: `{"purged":<number>}`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/purge-pii/route.ts vercel.json
git commit -m "feat(analytics): 90-day raw-IP retention cron

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Environment variable + docs

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`

- [ ] **Step 1: Generate a salt and add it to `.env.local`**

Run:
```bash
node -e "console.log('ANALYTICS_IP_SALT=' + require('node:crypto').randomBytes(24).toString('hex'))" >> .env.local
```
Verify the line was appended (it should be a 48-hex-char value).

- [ ] **Step 2: Document the variable in `.env.example`**

Add to `.env.example`, after the `CRON_SECRET` block:

```bash
# ── Analytics (salted IP hashing for session dedup) ──────────────────────────
ANALYTICS_IP_SALT=long-random-string
```

- [ ] **Step 3: Set the variable in the deployment environment**

Add `ANALYTICS_IP_SALT` (the value from Step 1, or a fresh random one) to the Vercel project's environment variables for Production and Preview. Note: changing the salt later invalidates dedup continuity (old vs new hashes won't match) — set it once.

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(analytics): document ANALYTICS_IP_SALT env var

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(`.env.local` is gitignored — do not commit it.)

---

### Task 8: Full verification & analysis views

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all unit tests pass (including `lib/analytics/context.test.ts`).

Run: `npm run test:integration`
Expected: all integration tests pass (including `lib/analytics/track.itest.ts`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Sanity-check the metrics the feature was built for**

Run:
```bash
node --env-file=.env.local -e "const {createClient}=require('@supabase/supabase-js');const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});(async()=>{const sessions=await a.from('analytics_sessions').select('*',{count:'exact',head:true});const distinctActivated=await a.from('analytics_events').select('user_id',{count:'exact',head:true}).eq('name','pick_saved');console.log('sessions rows:', sessions.count);console.log('pick_saved events:', distinctActivated.count);})()"
```
Expected: prints non-error counts. `pick_saved` count reflects backfill + any new picks. (Distinct-user and IP-dedup analyses are best run as SQL in the Supabase editor; see the spec's "Metrics unlocked" section.)

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore(analytics): verification fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

- **Why a `record_session` RPC instead of a `supabase-js` upsert:** `supabase-js` can't express the `coalesce(existing, new)` first-touch logic needed so a later page-view (with no UTM in the URL) doesn't wipe the original acquisition source. The RPC does it atomically.
- **Duplicate `pick_saved` rows are expected and fine.** The bracket editor deletes + re-inserts removed picks; each insert re-fires the trigger. Activation metrics use `count(distinct user_id)`, which is unaffected. We intentionally avoided a unique index that would have broken the re-insert.
- **Local geo is empty.** `x-vercel-ip-*` headers only exist on Vercel. Country/region/city populate after deploy, not in `npm run dev`.
- **No-JS clients / bots** still get an `auth.users` row (via `proxy.ts`) but no `analytics_sessions` row. The gap between the two counts is itself a useful bot-inflation metric.
