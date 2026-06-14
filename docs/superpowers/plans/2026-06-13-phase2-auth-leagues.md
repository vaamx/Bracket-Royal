# Phase 1 — Plan 2: Auth & Leagues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in (email magic-link + Google OAuth), get a profile, and create or join private leagues — plus auto-join a global league — all protected by correct Row-Level Security.

**Architecture:** Supabase Auth issues sessions; Next.js middleware refreshes them; a `/auth/callback` route exchanges the auth code. A `SECURITY DEFINER` trigger provisions a `profiles` row and global-league membership on signup. Leagues are created directly by the authenticated user (RLS-guarded inserts) and joined via a `SECURITY DEFINER` RPC that looks up the invite code without exposing other leagues. RLS policies use a `SECURITY DEFINER` membership helper to avoid recursive-policy errors.

**Tech Stack:** Supabase Auth + Postgres RLS, `@supabase/ssr`, Next.js 16 App Router (middleware + route handlers + server actions), React 19 client components, Vitest (unit + integration against the local stack).

---

## Decisions for this plan

- **Working auth paths:** **email magic-link** (works locally via Mailpit at `http://127.0.0.1:54324`) and **Google OAuth** (wired; activates when `GOOGLE_CLIENT_ID`/`GOOGLE_SECRET` are set). **Apple** is documented config-only (needs a paid Apple Developer account) — a stub, not built/tested here.
- **Integration tests** run against the **running local Supabase stack** using the service-role key to provision email+password users (bypassing the email flow), then sign in to get authenticated clients. They live in `*.itest.ts` and run via `npm run test:integration` — they are NOT part of `npm test` (which must stay Docker-free).
- **Global league:** one fixed row (`id = 00000000-0000-0000-0000-000000000001`, `invite_code = 'GLOBAL'`, `is_global = true`, no owner). Every new user is auto-joined.
- **Predictions RLS** (own-row + lock check) is included here even though the predictions UI is Plan 3 — the table exists and the policy belongs with the security model.

---

## File Structure (created/modified by this plan)

```
supabase/config.toml                                   # MODIFY: add Google provider + redirect URLs
supabase/migrations/0002_auth_leagues_rls.sql          # global league, profile trigger, RLS policies, helpers, join RPC
.env.local.example                                     # MODIFY: add GOOGLE_CLIENT_ID/SECRET (optional)
vitest.config.ts                                       # MODIFY: keep unit-only; integration uses its own config
vitest.integration.config.ts                           # integration test runner (loads .env.local, includes *.itest.ts)
middleware.ts                                          # session refresh on every request
lib/supabase/middleware.ts                             # updateSession helper used by middleware.ts
app/auth/callback/route.ts                             # OAuth/OTP code exchange
app/auth/auth-code-error/page.tsx                      # fallback when exchange fails
app/(auth)/login/page.tsx          + login-form.tsx    # sign-in UI (Google + magic link)
app/(app)/onboarding/page.tsx      + onboarding-form.tsx  # set display name + create/join league
app/(app)/leagues/page.tsx                             # my leagues list
app/(app)/leagues/actions.ts                           # server actions: createLeague, joinLeague, setDisplayName, signOut
lib/leagues/inviteCode.ts          + inviteCode.test.ts   # pure invite-code generator (TDD)
lib/leagues/queries.ts                                 # getMyLeagues, getSessionProfile (server-side reads)
lib/supabase/admin.ts                                  # service-role client (server-only; tests + future jobs)
lib/auth/rls.itest.ts                                  # integration tests for RLS + join RPC
components/ui/Input.tsx                                 # themed input primitive
```

---

## Task 1: Invite-code generator (pure, TDD)

**Files:**
- Create: `lib/leagues/inviteCode.ts`, `lib/leagues/inviteCode.test.ts`

- [ ] **Step 1: Write the failing test `lib/leagues/inviteCode.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { generateInviteCode, INVITE_ALPHABET } from "@/lib/leagues/inviteCode";

describe("generateInviteCode", () => {
  it("is 6 chars by default, all from the unambiguous alphabet", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
    for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
  });

  it("honors a custom length", () => {
    expect(generateInviteCode(8)).toHaveLength(8);
  });

  it("excludes ambiguous characters (0/O/1/I/L)", () => {
    expect(INVITE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it("is deterministic given an injected rng (for testability)", () => {
    // rng returns 0 -> always the first alphabet char
    const code = generateInviteCode(4, () => 0);
    expect(code).toBe(INVITE_ALPHABET[0].repeat(4));
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/leagues/inviteCode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/leagues/inviteCode.ts`**

```typescript
/** Unambiguous uppercase alphabet (no 0/O/1/I/L) for human-shareable codes. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Generate a random invite code. `rng` returns a float in [0,1) and defaults to a
 * crypto-backed source; it is injectable so tests can be deterministic.
 */
export function generateInviteCode(length = 6, rng: () => number = cryptoRandom): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[Math.floor(rng() * INVITE_ALPHABET.length)];
  }
  return out;
}

function cryptoRandom(): number {
  // 32-bit unsigned int / 2^32 -> [0,1)
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/leagues/inviteCode.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/leagues/inviteCode.ts lib/leagues/inviteCode.test.ts
git commit -m "feat(leagues): unambiguous invite-code generator (TDD)"
```

---

## Task 2: Migration 0002 — global league, profile trigger, RLS policies, join RPC

**Files:**
- Create: `supabase/migrations/0002_auth_leagues_rls.sql`

- [ ] **Step 1: Write `supabase/migrations/0002_auth_leagues_rls.sql`**

```sql
-- Auth provisioning + leagues access model for World Cup 2026 predictions.

-- 1. The global league everyone joins automatically.
insert into public.leagues (id, name, invite_code, owner_id, is_global)
values ('00000000-0000-0000-0000-000000000001', 'Global', 'GLOBAL', null, true)
on conflict (id) do nothing;

-- 2. Provision a profile + global membership when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id)
  values ('00000000-0000-0000-0000-000000000001', new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. SECURITY DEFINER membership helper (avoids recursive RLS on league_members).
create or replace function public.is_member(p_league uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league and user_id = auth.uid()
  );
$$;

-- 4. RLS policies.

-- profiles: any authenticated user can read profiles (needed for leaderboards);
-- a user may update only their own. Inserts happen via the trigger (definer).
create policy "profiles readable by authenticated"
  on public.profiles for select to authenticated using (true);
create policy "profiles updatable by owner"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- leagues: visible if global or you're a member; create as yourself; owner updates.
create policy "leagues visible to members or global"
  on public.leagues for select to authenticated
  using (is_global or public.is_member(id));
create policy "leagues created by owner"
  on public.leagues for insert to authenticated
  with check (owner_id = auth.uid());
create policy "leagues updated by owner"
  on public.leagues for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- league_members: see co-members of your leagues; add only yourself.
create policy "members visible to fellow members"
  on public.league_members for select to authenticated
  using (public.is_member(league_id));
create policy "members can add themselves"
  on public.league_members for insert to authenticated
  with check (user_id = auth.uid());

-- league_standings: members can read; writes are service-role only (no write policy).
create policy "standings visible to members"
  on public.league_standings for select to authenticated
  using (public.is_member(league_id));

-- achievements: a user can read their own; writes are service-role only.
create policy "own achievements readable"
  on public.achievements for select to authenticated
  using (user_id = auth.uid());

-- predictions: a user reads only their own; may write only their own AND only
-- before the match locks. (UI arrives in Plan 3; the security model belongs here.)
create policy "own predictions readable"
  on public.predictions for select to authenticated
  using (user_id = auth.uid());
create policy "own predictions insertable before lock"
  on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.lock_at is null or now() < m.lock_at)
    )
  );
create policy "own predictions updatable before lock"
  on public.predictions for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.lock_at is null or now() < m.lock_at)
    )
  );

-- 5. Join-by-code RPC: looks up a league by code without exposing it via RLS,
-- then adds the caller as a member. Returns the joined league.
create or replace function public.join_league_by_code(p_code text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.leagues;
begin
  select * into l from public.leagues where invite_code = upper(trim(p_code));
  if l.id is null then
    raise exception 'League not found' using errcode = 'no_data_found';
  end if;
  insert into public.league_members (league_id, user_id)
  values (l.id, auth.uid())
  on conflict do nothing;
  return l;
end;
$$;

revoke all on function public.join_league_by_code(text) from public;
grant execute on function public.join_league_by_code(text) to authenticated;
```

- [ ] **Step 2: Apply the migration to the local DB**

Run:
```bash
cd /Users/vaamx/worldcup2026 && npx supabase db reset
```
Expected: both `0001_core_schema.sql` and `0002_auth_leagues_rls.sql` apply with no errors, then the seed runs.

- [ ] **Step 3: Verify the global league + policies exist**

Run (find the container name first with `docker ps --format '{{.Names}}' | grep supabase_db`):
```bash
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select id, name, invite_code, is_global from public.leagues;"
docker exec "$DB" psql -U postgres -d postgres -c "select count(*) as policy_count from pg_policies where schemaname='public';"
docker exec "$DB" psql -U postgres -d postgres -c "select proname from pg_proc where proname in ('handle_new_user','is_member','join_league_by_code');"
```
Expected: one `Global / GLOBAL / t` league row; a policy_count of 12 (2 reference-table read policies from 0001 + 10 added here); all three functions listed.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/migrations/0002_auth_leagues_rls.sql
git commit -m "feat(db): auth provisioning trigger, leagues RLS, join-by-code RPC"
```

---

## Task 3: Service-role admin client (server-only)

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Write `lib/supabase/admin.ts`**

```typescript
import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server contexts
 * (integration tests, cron/scoring jobs). Never import into client code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

- [ ] **Step 2: Install `server-only` and verify type-check**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm install server-only
npx tsc --noEmit
```
Expected: installs; `tsc` exits 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/supabase/admin.ts package.json package-lock.json
git commit -m "feat(db): server-only service-role admin client"
```

---

## Task 4: Integration tests for RLS + join RPC

These run against the **running local stack**. They confirm the security model actually behaves — the highest-value verification in this plan.

**Files:**
- Create: `vitest.integration.config.ts`, `lib/auth/rls.itest.ts`
- Modify: `package.json` (script), `vitest.config.ts` (exclude `*.itest.ts`)

- [ ] **Step 1: Install the dotenv loader and add the integration config**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm install -D dotenv
```

Create `vitest.integration.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.itest.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 2: Keep `*.itest.ts` out of the default unit run — modify `vitest.config.ts`**

Change the `test` block in `vitest.config.ts` to exclude integration tests:
```typescript
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: ["lib/**/*.itest.ts", "node_modules/**"],
  },
```

- [ ] **Step 3: Add the integration script to `package.json`**

In `"scripts"` add:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 4: Write `lib/auth/rls.itest.ts`**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const GLOBAL_LEAGUE = "00000000-0000-0000-0000-000000000001";

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Create a confirmed email+password user and return an authenticated client. */
async function makeUser(email: string): Promise<{ id: string; client: SupabaseClient }> {
  const password = "Password123!";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  return { id: data.user!.id, client };
}

describe("RLS + provisioning (integration)", () => {
  let alice: { id: string; client: SupabaseClient };
  let bob: { id: string; client: SupabaseClient };

  beforeAll(async () => {
    // Unique emails per run so reseeding isn't required.
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;
    alice = await makeUser(`alice-${stamp}@example.com`);
    bob = await makeUser(`bob-${stamp}@example.com`);
  });

  it("provisions a profile on signup", async () => {
    const { data } = await alice.client.from("profiles").select("id").eq("id", alice.id).single();
    expect(data?.id).toBe(alice.id);
  });

  it("auto-joins every new user to the global league", async () => {
    const { data } = await alice.client
      .from("league_members").select("league_id").eq("league_id", GLOBAL_LEAGUE).eq("user_id", alice.id);
    expect(data?.length).toBe(1);
  });

  it("blocks anonymous reads of profiles", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data } = await anon.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("lets a user create a private league and join via code, but hides it from non-members", async () => {
    const code = `T${process.pid}`.slice(0, 6).toUpperCase().padEnd(6, "X");
    const { data: league, error } = await alice.client
      .from("leagues")
      .insert({ name: "Alice's League", invite_code: code, owner_id: alice.id })
      .select()
      .single();
    expect(error).toBeNull();
    await alice.client.from("league_members").insert({ league_id: league!.id, user_id: alice.id });

    // Bob cannot see Alice's league yet.
    const { data: hidden } = await bob.client.from("leagues").select("id").eq("id", league!.id);
    expect(hidden ?? []).toHaveLength(0);

    // Bob joins via the RPC, then can see it.
    const { error: joinErr } = await bob.client.rpc("join_league_by_code", { p_code: code });
    expect(joinErr).toBeNull();
    const { data: visible } = await bob.client.from("leagues").select("id").eq("id", league!.id);
    expect(visible).toHaveLength(1);
  });

  it("rejects joining with an unknown code", async () => {
    const { error } = await bob.client.rpc("join_league_by_code", { p_code: "ZZZZZZ" });
    expect(error).not.toBeNull();
  });

  it("prevents a user from inserting predictions as someone else", async () => {
    const { error } = await bob.client.from("predictions").insert({
      user_id: alice.id, // not bob -> must be rejected by RLS
      match_id: "GA-MEX-BEL",
      predicted_home: 1,
      predicted_away: 0,
    });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 5: Run the integration suite against the local stack**

Run (the stack must be up; `.env.local` must hold the local anon + service-role keys):
```bash
cd /Users/vaamx/worldcup2026 && npm run test:integration
```
Expected: PASS — all RLS/provisioning tests pass. If a test about "blocks anonymous reads" fails, the policy is wrong — fix the migration, `db reset`, re-run.

- [ ] **Step 6: Confirm the default unit run is unaffected**

Run: `cd /Users/vaamx/worldcup2026 && npm test`
Expected: PASS — 25 tests (21 math + 4 invite-code), no integration tests included.

- [ ] **Step 7: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add vitest.config.ts vitest.integration.config.ts lib/auth/rls.itest.ts package.json package-lock.json
git commit -m "test(auth): integration tests for RLS, provisioning, and join-by-code"
```

---

## Task 5: Session middleware

**Files:**
- Create: `lib/supabase/middleware.ts`, `middleware.ts`

- [ ] **Step 1: Write `lib/supabase/middleware.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refresh the Supabase session cookie on each request and gate app routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/auth");
  const isProtected = path.startsWith("/onboarding") || path.startsWith("/leagues");

  if (!user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    return NextResponse.redirect(redirect);
  }
  if (user && isAuthRoute && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/leagues";
    return NextResponse.redirect(redirect);
  }

  return response;
}
```

- [ ] **Step 2: Write `middleware.ts` (repo root)**

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything except static assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds (middleware compiles).

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/supabase/middleware.ts middleware.ts
git commit -m "feat(auth): session-refresh middleware with route gating"
```

---

## Task 6: Auth callback + error route

**Files:**
- Create: `app/auth/callback/route.ts`, `app/auth/auth-code-error/page.tsx`

- [ ] **Step 1: Write `app/auth/callback/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Exchange the OAuth/OTP code for a session, then redirect into the app. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/leagues";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
```

- [ ] **Step 2: Write `app/auth/auth-code-error/page.tsx`**

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function AuthCodeError() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <h1 className="text-xl font-black">Sign-in link expired</h1>
        <p className="mt-2 text-sm text-white/70">
          That link didn&apos;t work or has already been used. Request a fresh one.
        </p>
        <div className="mt-4">
          <Link href="/login">
            <Button>Back to sign in</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add app/auth/callback/route.ts app/auth/auth-code-error/page.tsx
git commit -m "feat(auth): code-exchange callback + error route"
```

---

## Task 7: Themed Input primitive

**Files:**
- Create: `components/ui/Input.tsx`

- [ ] **Step 1: Write `components/ui/Input.tsx`**

```tsx
import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full h-11 rounded-xl bg-black/30 border border-white/15 px-4 text-sm " +
        "text-white placeholder:text-white/40 outline-none focus:border-[var(--bn-gold)] " +
        "transition-colors " +
        className
      }
      {...props}
    />
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/ui/Input.tsx
git commit -m "feat(ui): themed Input primitive"
```

---

## Task 8: Sign-in page (Google + magic link)

**Files:**
- Create: `app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`

- [ ] **Step 1: Write the client form `app/(auth)/login/login-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) setError(error.message);
  }

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <Card className="space-y-4">
      <div className="text-center">
        <p className="text-xs tracking-[3px] text-[var(--bn-accent)] font-bold">
          FIFA WORLD CUP 2026
        </p>
        <h1 className="mt-1 text-2xl font-black">Sign in to play</h1>
      </div>

      <Button variant="ghost" className="w-full" onClick={signInWithGoogle}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-white/40 text-xs">
        <span className="h-px flex-1 bg-white/10" /> OR <span className="h-px flex-1 bg-white/10" />
      </div>

      {sent ? (
        <p className="text-sm text-[var(--bn-success)] text-center">
          Check your email for a magic link to sign in.
        </p>
      ) : (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <Input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Email me a magic link"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Write the page `app/(auth)/login/page.tsx`**

```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-md p-6 min-h-dvh flex items-center">
      <div className="w-full">
        <LoginForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add "app/(auth)/login/page.tsx" "app/(auth)/login/login-form.tsx"
git commit -m "feat(auth): sign-in page with Google + email magic link"
```

---

## Task 9: League server actions + queries

**Files:**
- Create: `app/(app)/leagues/actions.ts`, `lib/leagues/queries.ts`

- [ ] **Step 1: Write `lib/leagues/queries.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";

export interface LeagueSummary {
  id: string;
  name: string;
  invite_code: string;
  is_global: boolean;
}

/** Leagues the signed-in user belongs to (global first, then by name). */
export async function getMyLeagues(): Promise<LeagueSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("league_members")
    .select("leagues(id, name, invite_code, is_global)")
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const leagues = (data ?? [])
    .map((row) => row.leagues as unknown as LeagueSummary)
    .filter(Boolean);
  return leagues.sort((a, b) => Number(b.is_global) - Number(a.is_global) || a.name.localeCompare(b.name));
}

/** The signed-in user's profile, or null if unauthenticated. */
export async function getSessionProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  return data;
}
```

- [ ] **Step 2: Write `app/(app)/leagues/actions.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateInviteCode } from "@/lib/leagues/inviteCode";

export async function setDisplayName(formData: FormData) {
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { error: "Name is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/leagues");
  return { ok: true };
}

export async function createLeague(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "League name is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Insert with a unique code, retrying on the rare collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInviteCode();
    const { data: league, error } = await supabase
      .from("leagues")
      .insert({ name, invite_code: code, owner_id: user.id })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") continue; // unique_violation on invite_code -> retry
      return { error: error.message };
    }
    await supabase.from("league_members").insert({ league_id: league.id, user_id: user.id });
    revalidatePath("/leagues");
    return { ok: true, code: league.invite_code };
  }
  return { error: "Could not generate a unique invite code, try again" };
}

export async function joinLeague(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Invite code is required" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("join_league_by_code", { p_code: code });
  if (error) return { error: "League not found for that code" };
  revalidatePath("/leagues");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add "app/(app)/leagues/actions.ts" lib/leagues/queries.ts
git commit -m "feat(leagues): server actions (create/join/displayName/signOut) + queries"
```

---

## Task 10: Onboarding + Leagues screens

**Files:**
- Create: `app/(app)/onboarding/page.tsx`, `app/(app)/onboarding/onboarding-form.tsx`, `app/(app)/leagues/page.tsx`

- [ ] **Step 1: Write `app/(app)/onboarding/onboarding-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDisplayName } from "@/app/(app)/leagues/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function action(formData: FormData) {
    setSaving(true);
    setError(null);
    const res = await setDisplayName(formData);
    setSaving(false);
    if (res?.error) setError(res.error);
    else router.push("/leagues");
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Pick your name</h1>
        <p className="mt-1 text-sm text-white/60">This is how friends will see you on the leaderboard.</p>
      </div>
      <form action={action} className="space-y-3">
        <Input name="display_name" defaultValue={initialName} placeholder="Your display name" required />
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 2: Write `app/(app)/onboarding/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/leagues/queries";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  return (
    <main className="mx-auto max-w-md p-6 min-h-dvh flex items-center">
      <div className="w-full">
        <OnboardingForm initialName={profile.display_name ?? ""} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Write `app/(app)/leagues/page.tsx`** (server component: list + create/join forms + sign out)

```tsx
import { getMyLeagues, getSessionProfile } from "@/lib/leagues/queries";
import { createLeague, joinLeague, signOut } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { redirect } from "next/navigation";

export default async function LeaguesPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  const leagues = await getMyLeagues();

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">YOUR LEAGUES</p>
          <h1 className="text-2xl font-black">Hi, {profile.display_name}</h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost">Sign out</Button>
        </form>
      </header>

      <section className="space-y-3">
        {leagues.map((l) => (
          <Card key={l.id} className="flex items-center justify-between">
            <div>
              <p className="font-bold">{l.name}</p>
              {!l.is_global && (
                <p className="text-xs text-white/50">Invite code: <span className="font-mono text-[var(--bn-gold)]">{l.invite_code}</span></p>
              )}
            </div>
            {l.is_global && <span className="text-xs text-white/50">Everyone</span>}
          </Card>
        ))}
      </section>

      <Card className="space-y-3">
        <h2 className="font-bold">Create a league</h2>
        <form action={createLeague} className="flex gap-2">
          <Input name="name" placeholder="League name" required />
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Join a league</h2>
        <form action={joinLeague} className="flex gap-2">
          <Input name="code" placeholder="Invite code" className="font-mono uppercase" required />
          <Button type="submit" variant="ghost">Join</Button>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add "app/(app)/onboarding" "app/(app)/leagues/page.tsx"
git commit -m "feat(leagues): onboarding + leagues screens (create/join/list/sign out)"
```

---

## Task 11: Wire Google provider config + env (config-ready)

**Files:**
- Modify: `supabase/config.toml`, `.env.local.example`

- [ ] **Step 1: Add the Google provider + redirect URLs to `supabase/config.toml`**

Find the `[auth]` block and ensure `additional_redirect_urls` includes the callback, then add a Google provider block. Set `site_url` to `http://localhost:3000` (matches the dev server). The block:
```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_CLIENT_ID)"
secret = "env(GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
```
And in `[auth]` ensure:
```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/auth/callback", "http://127.0.0.1:3000/auth/callback"]
```
Note in a comment above the Google block: Apple is intentionally left disabled — it requires a paid Apple Developer account; enable `[auth.external.apple]` with `env(APPLE_CLIENT_ID)`/`env(APPLE_SECRET)` when available.

- [ ] **Step 2: Add the optional OAuth env to `.env.local.example`**

Append:
```bash
# Optional — Google OAuth (sign-in works via email magic link without these).
# Register an OAuth app at https://console.cloud.google.com and set:
GOOGLE_CLIENT_ID=
GOOGLE_SECRET=
```

- [ ] **Step 3: Restart the stack so config takes effect, and verify it still boots**

Run:
```bash
cd /Users/vaamx/worldcup2026
npx supabase stop
npx supabase start
```
Expected: stack restarts cleanly. (Google login will only function once real `GOOGLE_CLIENT_ID`/`GOOGLE_SECRET` exist; the magic-link path works regardless.)

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/config.toml .env.local.example
git commit -m "chore(auth): config-ready Google provider + redirect URLs"
```

---

## Task 12: Manual end-to-end verification + final gates

- [ ] **Step 1: Manually verify the magic-link sign-in loop**

Run `npm run dev`, open `http://localhost:3000/login`, enter any email, submit. Open Mailpit at `http://127.0.0.1:54324`, click the magic link in the received email. Expected: redirected to `/leagues`, greeted by name, and the **Global** league is listed. Create a league (note the code shows on the card), then in a private window sign in as a second email and **join** with that code — both users should now see the league.

- [ ] **Step 2: Run all gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                 # expect 25 passed (21 math + 4 invite-code)
npm run test:integration # expect all RLS/provisioning tests pass (stack running)
npm run build            # expect success
npx tsc --noEmit         # expect 0 errors
```

- [ ] **Step 3: Confirm clean tree**

Run: `cd /Users/vaamx/worldcup2026 && git status --short`
Expected: empty.

---

## Self-Review Notes (author)

- **Spec coverage:** Social login (Google) + magic link → Tasks 8, 11. Profiles (auto-create) → Task 2 trigger; display name → Tasks 9–10. Create/join private leagues via invite code → Tasks 1, 2 (RPC), 9, 10. Global league + auto-join → Task 2. RLS for profiles/leagues/league_members/league_standings/achievements/predictions (spec §9) → Task 2, verified by Task 4 integration tests. Onboarding flow (login → name → leagues) → Tasks 8, 10 + middleware gating (Task 5).
- **Deferred-by-design:** Apple OAuth (needs paid dev account — config stub only); the predictions UI and feed/scoring (Plans 3–4); league_standings writes (service-role, Plan 4); avatar upload (later polish). These are noted, not gaps.
- **Recursion-safe RLS:** `league_members`/`leagues`/`league_standings` policies call the `SECURITY DEFINER` `is_member()` helper rather than selecting `league_members` inside its own policy — this avoids the well-known Postgres infinite-recursion error. Verified by the Task 4 "hides it from non-members" test.
- **Type/name consistency:** `join_league_by_code(p_code)` RPC name + arg match between the migration (Task 2), the integration test (Task 4), and the `joinLeague` action (Task 9). `generateInviteCode` signature matches between Task 1 and its use in Task 9. The global league UUID `00000000-0000-0000-0000-000000000001` is identical in the migration and the integration test.
- **Test-suite split:** `*.test.ts` (unit, Docker-free) stays in `npm test`; `*.itest.ts` (needs the local stack) runs via `npm run test:integration`. `vitest.config.ts` excludes `*.itest.ts` so the default run never depends on Docker.
```
