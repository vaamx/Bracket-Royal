# Guest → Account Data Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop silently losing an anonymous guest's predictions when they convert to a real account, by migrating the guest's data into the new account (non-destructively) and deleting the emptied guest so user counts stay accurate.

**Architecture:** Keep the in-place `updateUser` upgrade as the happy path. Add a server-side safety net: a server action mints an HMAC-signed token of the guest's anonymous `user_id`, carried in `emailRedirectTo`; after the new session is established, the auth callback verifies the token and calls a `SECURITY DEFINER` SQL function `claim_guest_data(guest, new_user)` that reassigns the guest's picks/leagues into the new account (account's own rows win on conflict) and deletes the emptied anonymous guest.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest (unit `*.test.ts` + live-DB integration `*.itest.ts`).

## Global Constraints

- **Forward-only.** No backfill, no retroactive reconciliation of already-orphaned guests. Applying the migration must change zero existing rows.
- **Non-destructive.** On a `(user_id, match_id)` / `(user_id, player_id)` conflict, the **account's own row always wins**; the guest's conflicting row is discarded.
- **Migrate only from an anonymous user.** `claim_guest_data` no-ops unless `p_guest_id` is `is_anonymous = true` and `≠ p_new_user`.
- **App/runtime code uses `@supabase/supabase-js` / `@supabase/ssr` only** — never import `pg` in committed code.
- **Service-role client** comes from `createAdminClient()` (`lib/supabase/admin.ts`).
- **`SECURITY DEFINER` functions** `set search_path = public`; execute revoked from `public, anon, authenticated`, granted only to `service_role`.
- **Token secret:** `process.env.GUEST_CLAIM_SECRET`. The pure signing module never reads `process.env` — callers pass the secret in.
- **Fail-open:** a claim/token failure must never block the sign-in redirect.
- **Migration apply:** controller applies SQL to the live DB (no CLI link); keep `supabase/migrations/0012_*.sql` tracked and `supabase/PROD_SETUP_0012.sql` identical.
- **Integration tests hit the live cloud DB**; create users with unique ids and clean them up in `afterAll`.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `supabase/migrations/0012_claim_guest_data.sql` (create) + `supabase/PROD_SETUP_0012.sql` (create) — the `claim_guest_data` function + grants.
- `lib/auth/claimGuestData.itest.ts` (create) — live-DB integration test for the RPC.
- `lib/auth/guestClaim.ts` (create) — **pure** HMAC sign/verify (secret passed in; no `server-only`, no env).
- `lib/auth/guestClaim.test.ts` (create) — unit tests.
- `app/(auth)/login/actions.ts` (create) — `mintGuestClaim` server action.
- `lib/auth/claimGuestData.ts` (create) — server helper: verify token + call the RPC.
- `app/(auth)/login/login-form.tsx` (modify) — thread the token into both redirect paths.
- `app/auth/callback/route.ts` (modify) — claim after session established.
- `.env.example` (modify) + `.env.local` (modify) — `GUEST_CLAIM_SECRET`.

---

### Task 1: `claim_guest_data` migration + integration test

**Files:**
- Create: `supabase/migrations/0012_claim_guest_data.sql`
- Create: `supabase/PROD_SETUP_0012.sql` (identical content)
- Create: `lib/auth/claimGuestData.itest.ts`

**Interfaces:**
- Produces: SQL function `public.claim_guest_data(p_guest_id uuid, p_new_user uuid) returns void`.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/0012_claim_guest_data.sql`:

```sql
-- 0012: claim_guest_data — forward-only fix for guest->account data loss.
-- Migrates an anonymous guest's data into a newly created/signed-in account,
-- then deletes the emptied guest so it stops inflating user counts.
-- Non-destructive: the account's own rows always win on conflict.

create or replace function public.claim_guest_data(p_guest_id uuid, p_new_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_anon boolean;
begin
  if p_guest_id is null or p_new_user is null or p_guest_id = p_new_user then
    return;
  end if;

  -- Only ever claim from an ANONYMOUS (unclaimed) user.
  select is_anonymous into v_is_anon from auth.users where id = p_guest_id;
  if v_is_anon is distinct from true then
    return;
  end if;

  -- Predictions: move guest rows only for matches the account hasn't predicted.
  -- The account's own picks always win; conflicting guest rows are left behind
  -- and removed when the guest is deleted (cascade).
  update public.predictions g
     set user_id = p_new_user
   where g.user_id = p_guest_id
     and not exists (
       select 1 from public.predictions n
       where n.user_id = p_new_user and n.match_id = g.match_id
     );

  -- Scorer predictions: same rule, keyed on player_id.
  update public.scorer_predictions g
     set user_id = p_new_user
   where g.user_id = p_guest_id
     and not exists (
       select 1 from public.scorer_predictions n
       where n.user_id = p_new_user and n.player_id = g.player_id
     );

  -- Private league memberships: copy non-global memberships to the new user.
  insert into public.league_members (league_id, user_id)
  select lm.league_id, p_new_user
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  where lm.user_id = p_guest_id and l.is_global = false
  on conflict do nothing;

  -- Leagues the guest created: hand ownership to the new user. Required before
  -- deleting the guest because leagues.owner_id -> profiles(id) is RESTRICT and
  -- profiles -> auth.users cascades, so otherwise the delete below would fail.
  -- (The global league has owner_id null and is never matched.)
  update public.leagues set owner_id = p_new_user where owner_id = p_guest_id;

  -- Delete the emptied guest (cascades profile + leftover predictions/memberships
  -- + analytics rows) so it no longer inflates the user count.
  delete from auth.users where id = p_guest_id and is_anonymous = true;
end;
$$;

revoke execute on function public.claim_guest_data(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.claim_guest_data(uuid, uuid) to service_role;
```

- [ ] **Step 2: Copy to the prod-setup file**

Create `supabase/PROD_SETUP_0012.sql` with the **exact same content** as `supabase/migrations/0012_claim_guest_data.sql`.

- [ ] **Step 3: Write the integration test**

Create `lib/auth/claimGuestData.itest.ts` (tests the `claim_guest_data` RPC directly against the live DB):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("claim_guest_data (integration)", () => {
  let guestId: string;
  let newUserId: string;
  let leagueId: string;
  let matchA: string;
  let matchB: string;
  let playerX: string;

  beforeAll(async () => {
    const stamp = `${process.pid}-${Math.floor(performance.now())}`;

    // Anonymous guest (real anonymous session).
    const guestClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: anon, error: anonErr } = await guestClient.auth.signInAnonymously();
    if (anonErr) throw anonErr;
    guestId = anon.user!.id;

    // Target real account.
    const { data: real, error: realErr } = await admin.auth.admin.createUser({
      email: `claim-${stamp}@example.com`,
      password: "Password123!",
      email_confirm: true,
    });
    if (realErr) throw realErr;
    newUserId = real.user!.id;

    // Two non-final matches + a player.
    const { data: matches } = await admin.from("matches").select("id").neq("status", "final").limit(2);
    matchA = matches![0].id;
    matchB = matches![1].id;
    const { data: players } = await admin.from("players").select("id").limit(1);
    playerX = players![0].id;

    // A PRIVATE league OWNED by the guest (exercises the owner-reassign path).
    const code = `CLM${stamp}`.replace(/[^A-Z0-9]/gi, "").slice(0, 12).toUpperCase();
    const { data: league, error: lErr } = await admin
      .from("leagues")
      .insert({ name: `Claim Test ${stamp}`, invite_code: code, owner_id: guestId, is_global: false })
      .select("id")
      .single();
    if (lErr) throw lErr;
    leagueId = league!.id;
    await admin.from("league_members").insert({ league_id: leagueId, user_id: guestId });

    // Guest picks: matchA conflicts with the account; matchB is unique to the guest.
    await admin.from("predictions").insert([
      { user_id: guestId, match_id: matchA, predicted_home: 1, predicted_away: 1 },
      { user_id: guestId, match_id: matchB, predicted_home: 2, predicted_away: 0 },
    ]);
    await admin.from("scorer_predictions").insert({ user_id: guestId, player_id: playerX });

    // The account's own (conflicting) pick for matchA.
    await admin.from("predictions").insert({ user_id: newUserId, match_id: matchA, predicted_home: 3, predicted_away: 3 });
  });

  afterAll(async () => {
    if (newUserId) await admin.auth.admin.deleteUser(newUserId);
    if (leagueId) await admin.from("leagues").delete().eq("id", leagueId);
    if (guestId) await admin.auth.admin.deleteUser(guestId).catch(() => {}); // normally already deleted by the RPC
  });

  it("migrates non-conflicting data, preserves the account's picks, reassigns the league, and deletes the guest", async () => {
    const { error } = await admin.rpc("claim_guest_data", { p_guest_id: guestId, p_new_user: newUserId });
    expect(error).toBeNull();

    // matchB (unique to guest) moved to the new user.
    const { data: b } = await admin
      .from("predictions").select("predicted_home,predicted_away")
      .eq("user_id", newUserId).eq("match_id", matchB).maybeSingle();
    expect(b).toEqual({ predicted_home: 2, predicted_away: 0 });

    // matchA: the account keeps ITS pick (3-3), not the guest's (1-1).
    const { data: a } = await admin
      .from("predictions").select("predicted_home,predicted_away")
      .eq("user_id", newUserId).eq("match_id", matchA).maybeSingle();
    expect(a).toEqual({ predicted_home: 3, predicted_away: 3 });

    // Scorer pick moved.
    const { data: s } = await admin
      .from("scorer_predictions").select("player_id").eq("user_id", newUserId).eq("player_id", playerX);
    expect(s?.length).toBe(1);

    // Private league: ownership reassigned + new user is a member; league still exists.
    const { data: lg } = await admin.from("leagues").select("owner_id").eq("id", leagueId).maybeSingle();
    expect(lg?.owner_id).toBe(newUserId);
    const { data: m } = await admin
      .from("league_members").select("league_id").eq("user_id", newUserId).eq("league_id", leagueId);
    expect(m?.length).toBe(1);

    // Guest user deleted (de-inflation).
    const { data: g } = await admin.auth.admin.getUserById(guestId);
    expect(g.user).toBeNull();

    // No leftover guest predictions or scorer picks.
    const { data: leftovers } = await admin.from("predictions").select("match_id").eq("user_id", guestId);
    expect(leftovers ?? []).toHaveLength(0);
    const { data: scorerLeftovers } = await admin.from("scorer_predictions").select("player_id").eq("user_id", guestId);
    expect(scorerLeftovers ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Verify the test fails before the migration is applied (RED)**

Run: `npx vitest run --config vitest.integration.config.ts lib/auth/claimGuestData.itest.ts`
Expected: FAIL — the RPC errors (`Could not find the function public.claim_guest_data`), so `expect(error).toBeNull()` fails. This confirms the test exercises the not-yet-created function.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_claim_guest_data.sql supabase/PROD_SETUP_0012.sql lib/auth/claimGuestData.itest.ts
git commit -m "feat(auth): claim_guest_data migration + integration test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Controller note:** after this task, the controller applies `PROD_SETUP_0012.sql` to the live DB and re-runs the integration test to confirm GREEN (the implementer cannot apply migrations).

---

### Task 2: Pure HMAC token (`lib/auth/guestClaim.ts`)

**Files:**
- Create: `lib/auth/guestClaim.ts`
- Test: `lib/auth/guestClaim.test.ts`

**Interfaces:**
- Produces:
  - `signGuestClaim(guestId: string, secret: string, nowMs?: number): string`
  - `verifyGuestClaim(token: string, secret: string, nowMs?: number): string | null`

- [ ] **Step 1: Write the failing unit test**

Create `lib/auth/guestClaim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { signGuestClaim, verifyGuestClaim } from "@/lib/auth/guestClaim";

const SECRET = "test-secret";
const GUEST = "11111111-1111-1111-1111-111111111111";
const NOW = 1_000_000_000_000;

describe("guestClaim", () => {
  it("round-trips a guest id", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, SECRET, NOW)).toBe(GUEST);
  });

  it("rejects a tampered token", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyGuestClaim(tampered, SECRET, NOW)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, "other-secret", NOW)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signGuestClaim(GUEST, SECRET, NOW);
    expect(verifyGuestClaim(token, SECRET, NOW + 60 * 60 * 1000 + 1)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyGuestClaim("not-a-token", SECRET, NOW)).toBeNull();
    expect(verifyGuestClaim("", SECRET, NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/auth/guestClaim.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/guestClaim`.

- [ ] **Step 3: Implement `guestClaim.ts`**

Create `lib/auth/guestClaim.ts`:

```ts
import crypto from "node:crypto";

const TTL_MS = 60 * 60 * 1000; // 1 hour

function b64urlEncode(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

function hmac(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Sign a guest (anonymous) user id into a short-lived, tamper-proof token.
 * The secret is passed in (this module is pure — no env, no server-only).
 */
export function signGuestClaim(guestId: string, secret: string, nowMs: number = Date.now()): string {
  const payload = `${guestId}.${nowMs + TTL_MS}`;
  return `${b64urlEncode(payload)}.${hmac(payload, secret)}`;
}

/** Verify a guest-claim token; returns the guest id, or null if invalid/expired. */
export function verifyGuestClaim(token: string, secret: string, nowMs: number = Date.now()): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = hmac(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [guestId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!guestId || !Number.isFinite(exp) || exp < nowMs) return null;
  return guestId;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/auth/guestClaim.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/guestClaim.ts lib/auth/guestClaim.test.ts
git commit -m "feat(auth): pure HMAC guest-claim token with unit tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server glue — `mintGuestClaim` action + `claimGuestData` helper

**Files:**
- Create: `app/(auth)/login/actions.ts`
- Create: `lib/auth/claimGuestData.ts`

**Interfaces:**
- Consumes: `signGuestClaim` / `verifyGuestClaim` (Task 2); `createClient` from `lib/supabase/server`; `createAdminClient` from `lib/supabase/admin`; the `claim_guest_data` RPC (Task 1).
- Produces:
  - `mintGuestClaim(): Promise<string | null>` (server action)
  - `claimGuestData(guestToken: string | null, supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>): Promise<void>`

- [ ] **Step 1: Implement the `mintGuestClaim` server action**

Create `app/(auth)/login/actions.ts`:

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { signGuestClaim } from "@/lib/auth/guestClaim";

/**
 * If the caller is an anonymous guest, return a signed token of their user id
 * so a later sign-in can migrate their picks into the new account. Returns null
 * for non-guests or when the secret is unset.
 */
export async function mintGuestClaim(): Promise<string | null> {
  const secret = process.env.GUEST_CLAIM_SECRET;
  if (!secret) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.is_anonymous) return null;
  return signGuestClaim(user.id, secret);
}
```

- [ ] **Step 2: Implement the `claimGuestData` helper**

Create `lib/auth/claimGuestData.ts`:

```ts
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyGuestClaim } from "@/lib/auth/guestClaim";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Best-effort: migrate an anonymous guest's data into the just-signed-in user.
 * No-op unless a valid guest token is present and resolves to a different id.
 * Never throws — a failure must not block the sign-in redirect.
 */
export async function claimGuestData(guestToken: string | null, supabase: ServerClient): Promise<void> {
  try {
    if (!guestToken) return;
    const secret = process.env.GUEST_CLAIM_SECRET;
    if (!secret) return;
    const guestId = verifyGuestClaim(guestToken, secret);
    if (!guestId) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.id === guestId) return;

    const admin = createAdminClient();
    const { error } = await admin.rpc("claim_guest_data", { p_guest_id: guestId, p_new_user: user.id });
    if (error) console.error("claim_guest_data failed:", error.message);
  } catch (e) {
    console.error("claimGuestData failed:", e instanceof Error ? e.message : e);
  }
}
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "app/(auth)/login/actions.ts" lib/auth/claimGuestData.ts`
Expected: no errors (do NOT run `npm run lint` — the repo has unrelated pre-existing lint errors).

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/actions.ts" lib/auth/claimGuestData.ts
git commit -m "feat(auth): mintGuestClaim action + claimGuestData server helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire the token through login form + callback

**Files:**
- Modify: `app/(auth)/login/login-form.tsx`
- Modify: `app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `mintGuestClaim` (Task 3), `claimGuestData` (Task 3).

- [ ] **Step 1: Update the login form**

In `app/(auth)/login/login-form.tsx`:

Add the import after the existing `createClient` import:

```tsx
import { mintGuestClaim } from "./actions";
```

Remove the top-level `redirectTo` constant:

```tsx
  const redirectTo =
    typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
```

Replace the whole `sendEmailLink` function body with:

```tsx
  async function sendEmailLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // If the visitor is an anonymous guest, mint a signed token of their id so
    // the callback can migrate their picks even if sign-in lands on a different
    // account. Non-guests get a plain redirect.
    const guestToken = await mintGuestClaim();
    const base = `${window.location.origin}/auth/callback`;
    const redirectTo = guestToken ? `${base}?guest=${encodeURIComponent(guestToken)}` : base;

    if (guestToken) {
      // Guest: try to upgrade this account in place first (keeps their id).
      const { error: linkErr } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo });
      if (!linkErr) { setLoading(false); setSent(true); return; }
      // Email already has an account → fall through; the guest token rides along
      // so the callback still migrates their picks into that account.
    }

    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }
```

- [ ] **Step 2: Update the auth callback**

In `app/auth/callback/route.ts`:

Add the import after the analytics imports:

```ts
import { claimGuestData } from "@/lib/auth/claimGuestData";
```

In `GET`, after the line `const type = searchParams.get("type") as EmailOtpType | null;`, add:

```ts
  const guest = searchParams.get("guest");
```

In the `code` success branch, change:

```ts
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

to:

```ts
    if (!error) {
      await claimGuestData(guest, supabase);
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

In the `tokenHash` success branch, change:

```ts
    if (!error) {
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

to:

```ts
    if (!error) {
      await claimGuestData(guest, supabase);
      await logSignIn(request, supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
```

(Claim runs before `logSignIn` so the `signed_in` analytics event is attributed to the final, post-migration account.)

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "app/(auth)/login/login-form.tsx" app/auth/callback/route.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/login/login-form.tsx" app/auth/callback/route.ts
git commit -m "feat(auth): carry guest-claim token through login + callback

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> **Controller note:** after this task, the controller runs a live smoke (guest predicts → converts → picks present under the new account; counts drop by the converted guest).

---

### Task 5: `GUEST_CLAIM_SECRET` environment variable

**Files:**
- Modify: `.env.example`
- Modify: `.env.local` (gitignored — not committed)

- [ ] **Step 1: Generate the secret into `.env.local`**

Run (only if not already present):
```bash
grep -q '^GUEST_CLAIM_SECRET=' .env.local || printf '\nGUEST_CLAIM_SECRET=%s\n' "$(node -e "console.log(require('node:crypto').randomBytes(24).toString('hex'))")" >> .env.local
```
(The leading `\n` guards against the file lacking a trailing newline.) Verify with:
```bash
awk -F= '/^GUEST_CLAIM_SECRET=/{print "GUEST_CLAIM_SECRET len", length($2)}' .env.local
```
Expected: `GUEST_CLAIM_SECRET len 48`.

- [ ] **Step 2: Document it in `.env.example`**

Add to `.env.example`, after the `ANALYTICS_IP_SALT` block:

```bash
# ── Guest→account claim (HMAC secret for the guest-data migration token) ─────
GUEST_CLAIM_SECRET=long-random-string
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(auth): document GUEST_CLAIM_SECRET env var

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

(`.env.local` is gitignored — do not commit it. Deployment: set `GUEST_CLAIM_SECRET` in Vercel for Production + Preview.)

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `npm run test`
Expected: all pass, including `lib/auth/guestClaim.test.ts`.

- [ ] **Step 2: Integration tests for this feature**

Run: `npx vitest run --config vitest.integration.config.ts lib/auth/claimGuestData.itest.ts`
Expected: PASS (1 test, all assertions green) — requires the migration applied.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; `/auth/callback` and the login route compile.

- [ ] **Step 4: Final commit (only if verification required fixes)**

```bash
git add -A
git commit -m "chore(auth): verification fixes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

- **`claim_guest_data` is idempotent.** After the first claim the guest is deleted, so a re-run finds no anonymous guest and no-ops.
- **Order in the function matters:** reassign owned leagues *before* deleting the guest, or the `leagues.owner_id → profiles` RESTRICT FK aborts the delete.
- **`mintGuestClaim` is a server action imported into a client component** — this is an existing pattern in the repo (`onboarding-form.tsx` imports `setDisplayName`).
- **Don't run `npm run lint`** for per-file checks — the repo has 9 pre-existing lint errors in unrelated files; use `npx eslint <file>` on the files you changed.
- **Integration tests run against the live DB** and create real users; they clean up in `afterAll`, and `claim_guest_data` itself deletes the guest.
