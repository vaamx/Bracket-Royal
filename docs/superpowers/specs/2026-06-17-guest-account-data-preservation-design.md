# Guest → Account Data Preservation — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending implementation plan
**Author:** Victor Amaya (with Claude)

## Problem

When an anonymous guest makes predictions and then creates/signs into an
account, their work is silently lost in common cases. Root-cause investigation
found the guest→account conversion (`app/(auth)/login/login-form.tsx`) is
fragile, with no server-side safety net:

1. **Lossy fallback (`login-form.tsx:44`).** If `updateUser({ email })` errors —
   most importantly when that email already belongs to an account — the code
   falls through to `signInWithOtp({ email })`, which signs the person into a
   *different* `user_id`. Every guest pick (keyed by the old anonymous
   `user_id`) is orphaned.
2. **Browser / flow continuity.** The in-place upgrade only preserves data when
   the confirmation completes under the same `user_id`. When it doesn't (a
   different account is created, or the link opens in another browser/device),
   nothing reconnects the guest's data.
3. **No migration anywhere.** Predictions are keyed solely by `user_id`; there
   is no mechanism to re-associate guest data with a new account. The whole flow
   bets on the anon `user_id` surviving end-to-end; when it doesn't, data is
   gone silently.

Evidence (≈1-day-old prod): 9 anonymous users hold 224 picks; 2 email accounts
have 0 picks — consistent with conversions that didn't carry data over.

## Goals

- A guest's work survives account conversion **regardless of how conversion
  completes** — including the existing-email and different-`user_id` cases.
- The fix is **non-destructive**: a returning user's existing account data is
  never overwritten by an old guest session.
- The carry-over channel is **forgery-proof** — no one can claim another
  guest's data.

## Non-goals (YAGNI)

- Merging two *real* accounts.
- Migrating derived data (standings, daily_wins, achievements) — recomputed by
  scoring.
- Changing the anonymous-auth model or `proxy.ts`.
- Fixing email-template/flow configuration (flagged separately below).

## Decisions

| Decision | Choice |
|---|---|
| Conflict on a match both sides predicted | **Account keeps its own** (non-destructive merge; guest pick discarded). |
| How the old anon id reaches the callback | **HMAC-signed token** carried in `emailRedirectTo`, minted by a server action, verified server-side. |
| Migration scope | `predictions` + `scorer_predictions` + **private** `league_members` + **ownership of private leagues the guest created** (skip global league; derived data recomputed). |
| Happy path | Keep the in-place `updateUser` upgrade; migration is a **no-op when ids match**. |

## Architecture

The in-place `updateUser` upgrade stays the happy path. We add a server-side
**claim** step that runs after the new session is established and migrates guest
data into the new account when the resulting `user_id` differs from the guest's.

### 1. Signed guest token

A guest can't sign a token (the browser has no server secret), so a server
action mints it.

- **`lib/auth/guestClaim.ts`** (`server-only`):
  - `signGuestClaim(guestId: string): string` — `${guestId}.${expMs}.${hmac}`,
    where `hmac = HMAC-SHA256(GUEST_CLAIM_SECRET, "${guestId}.${expMs}")`,
    base64url. TTL ~1 hour.
  - `verifyGuestClaim(token: string): string | null` — recompute + constant-time
    compare, check `expMs > now`; return `guestId` or `null`.
- **`app/(auth)/login/actions.ts`** — server action
  `mintGuestClaim(): Promise<string | null>`: reads the user via the SSR server
  client; returns `signGuestClaim(user.id)` **only if the user is anonymous**,
  else `null`.

### 2. Login form changes (`app/(auth)/login/login-form.tsx`)

On submit, call `mintGuestClaim()` once.
- If it returns a token → the visitor is a guest. Build
  `emailRedirectTo = ${origin}/auth/callback?guest=${token}` and run the
  existing `updateUser({ email })` path; on error, fall through to
  `signInWithOtp({ email })` **carrying the same `emailRedirectTo`** (so the
  fallback is no longer lossy).
- If `null` → not a guest. `signInWithOtp` with a plain `/auth/callback`
  redirect.

This replaces the current client-side `getUser()`/`is_anonymous` branch with the
server action's authoritative result.

### 3. Migration function (`supabase/migrations/0012_claim_guest_data.sql`)

`SECURITY DEFINER` SQL function, service-role only:

```
public.claim_guest_data(p_guest_id uuid, p_new_user uuid) returns void
```

Behavior:
- No-op if `p_guest_id = p_new_user`, or `p_guest_id` is not an **anonymous**
  user in `auth.users` (safety — only unclaimed guest data moves).
- **predictions:** reassign guest rows to `p_new_user` only where the new user
  has no row for that `match_id`; delete any remaining (conflicting) guest rows.
- **scorer_predictions:** same, keyed on `player_id`.
- **league_members:** insert guest's non-global memberships for `p_new_user`
  (`on conflict do nothing`).
- **Owned leagues:** `update leagues set owner_id = p_new_user where owner_id =
  p_guest_id` — the guest keeps any private league they created. This is also
  **required for correctness**: `leagues.owner_id → profiles(id)` has no
  `ON DELETE` action (RESTRICT), and `profiles.id → auth.users(id)` cascades, so
  deleting a guest who owns a league would otherwise fail the FK and abort the
  whole claim. (The global league has `owner_id = null`, so it's never touched.)
- **Cleanup:** `delete from auth.users where id = p_guest_id and is_anonymous`
  — cascades away the emptied guest's profile, leftover predictions/memberships,
  and any analytics rows, and de-inflates the user count.

Grants: `set search_path = public`; execute revoked from `public, anon,
authenticated`, granted only to `service_role`. Mirrored to
`supabase/PROD_SETUP_0012.sql`.

### 4. Callback wiring (`app/auth/callback/route.ts`)

After a successful `exchangeCodeForSession` / `verifyOtp` (session established),
read `guest` from the query. If present: `verifyGuestClaim` → on a valid
`guestId`, resolve the now-authenticated user and call
`admin.rpc("claim_guest_data", { p_guest_id, p_new_user })` via
`createAdminClient()`. Wrapped in try/catch — a claim failure must never block
the redirect. No-op when ids match (the in-place-upgrade happy path).

### New / changed code

- `lib/auth/guestClaim.ts` (create) — sign/verify HMAC token.
- `app/(auth)/login/actions.ts` (create) — `mintGuestClaim` server action.
- `lib/auth/claimGuestData.ts` (create) — server helper: verify token + call the
  `claim_guest_data` RPC via the admin client (used by the callback).
- `app/(auth)/login/login-form.tsx` (modify) — thread the token into both
  redirect paths.
- `app/auth/callback/route.ts` (modify) — claim after session established.
- `supabase/migrations/0012_claim_guest_data.sql` + `PROD_SETUP_0012.sql`
  (create) — the function + grants.
- `.env.example` / `.env.local` (modify) — `GUEST_CLAIM_SECRET`.

## Security & safety

- **Forgery:** token is HMAC-signed with `GUEST_CLAIM_SECRET`; an attacker
  cannot mint a valid `guest` for an id they don't own.
- **Defense in depth:** even with a valid token, the function migrates **only
  from an anonymous user** — real-account data is never claimable.
- **Non-destructive:** the new account's own rows always win on conflict.
- **Idempotent:** re-running migrates nothing new (guest rows are gone after the
  first claim; the guest user is deleted).
- **Fail-open on the redirect:** claim errors are caught and logged; sign-in
  always completes.
- **TTL:** token expires (~1h) so a leaked link can't be replayed indefinitely.

## Edge cases

- **Happy path (same id):** `mintGuestClaim` token's `guestId == newUser` →
  function no-ops. No special-casing needed.
- **Existing-email returning user:** `updateUser` errors → fallback
  `signInWithOtp` into the existing account → token still rides along → guest's
  non-conflicting picks merge in.
- **Guest token but user signs into a fully-populated account:** all matches
  conflict → nothing reassigned → guest rows deleted, guest user removed; account
  unchanged. Correct.
- **Forged / expired / non-anonymous guest id:** rejected; no-op.

## Testing

- **Unit (`lib/auth/guestClaim.test.ts`):** sign→verify round-trip;
  tampered token → null; expired token → null.
- **Integration (`lib/auth/claimGuestData.itest.ts`, live DB):** create an
  anonymous guest + a separate target user; give the guest overlapping and
  non-overlapping predictions, a scorer pick, and a private-league membership;
  give the target a conflicting pick. Call `claim_guest_data`; assert:
  non-conflicting picks reassigned, conflicting pick kept as the account's,
  scorer pick moved, private-league membership added (global not duplicated),
  and the guest anon user deleted. Cleanup in `afterAll`.

## Rollout

1. Apply migration `0012_claim_guest_data.sql`.
2. Add `GUEST_CLAIM_SECRET` to env (local + Vercel Production/Preview).
3. Ship `guestClaim.ts`, `mintGuestClaim`, `claimGuestData.ts`, login-form +
   callback changes.

## Flagged (config, separate from this code)

Confirm Supabase's email template uses the **`token_hash`** confirmation style
rather than the legacy PKCE `?code=` link, so confirmation succeeds when the
link is opened on a different device. This governs whether the *session* can be
established cross-device; the migration designed here handles data once a
session exists under any `user_id`.
