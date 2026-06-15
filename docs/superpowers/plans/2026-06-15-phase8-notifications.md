# Phase 1 — Plan 8: Push & Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remind players (via web push and/or email, by their preference) when a match they haven't predicted is about to lock — without ever double-sending.

**Architecture:** A pure, tested selector decides which `(user, match, channel)` reminders are due (locking within a window, not yet predicted, not already sent, channel enabled). Two env-gated channel adapters — web push (`web-push` + VAPID) and email (Resend) — send the rendered templates; both no-op gracefully without keys. A `CRON_SECRET`-guarded cron route assembles inputs, calls the selector, sends, and logs each send for dedup. Users manage a service worker push subscription + per-channel preferences in a settings screen. New tables ship with their own RLS policies and grants (per the Plan-2 grant lesson).

**Tech Stack:** TypeScript, `web-push` (VAPID), `resend`, a service worker (`public/sw.js`), Next.js 16 route handler + a settings page, Supabase (3 new tables + service-role dispatch), Vitest.

**Required external setup (you provide):** generate VAPID keys with `npx web-push generate-vapid-keys`; create a Resend account + API key and a verified sender (or use `onboarding@resend.dev` for testing). Set the env vars in Task 6. **Until these exist, everything builds and the cron route runs as a safe no-op** (sends are skipped, nothing is logged). End-to-end send is verified manually once keys are present.

---

## File Structure

```
supabase/migrations/0005_notifications.sql      # push_subscriptions, notification_prefs, notifications_sent + RLS + grants
lib/notify/select.ts        + .test.ts           # pure selectDueReminders (window + dedup) — TDD
lib/notify/templates.ts     + .test.ts           # pure lock-reminder push payload + email subject/html — TDD
lib/notify/push.ts                               # web-push adapter (VAPID env-gated)
lib/notify/email.ts                              # Resend adapter (env-gated)
lib/notify/dispatch.ts                           # assemble inputs → select → send → log (service-role)
app/api/cron/notify/route.ts                     # CRON_SECRET-guarded dispatch trigger
vercel.json                                      # MODIFY: add the notify cron
public/sw.js                                     # service worker: push + notificationclick
lib/notify/subscribe.ts                          # client: register SW + subscribe + persist; prefs helpers
app/(app)/settings/page.tsx + settings-client.tsx# notification preferences UI
app/(app)/leagues/page.tsx                        # MODIFY: link to /settings
.env.local.example                               # MODIFY: VAPID + Resend + from-address
```

---

## Task 1: Migration — notification tables (RLS + grants)

**Files:**
- Create: `supabase/migrations/0005_notifications.sql`

- [ ] **Step 1: Write `supabase/migrations/0005_notifications.sql`**

```sql
-- Notification subscriptions, per-user preferences, and a send log for dedup.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  email text,                       -- delivery address (anon users have no auth email)
  updated_at timestamptz not null default now()
);

create table public.notifications_sent (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,               -- e.g. 'lock'
  ref text not null,                -- match id
  channel text not null,            -- 'push' | 'email'
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref, channel)
);

-- RLS
alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notifications_sent enable row level security;

-- A user manages only their own subscriptions + prefs. notifications_sent is
-- service-role only (no client policy -> deny), written by the dispatch job.
create policy "own push subs - select" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own push subs - insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "own push subs - delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create policy "own prefs - select" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
create policy "own prefs - insert" on public.notification_prefs for insert to authenticated with check (user_id = auth.uid());
create policy "own prefs - update" on public.notification_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Least-privilege grants for these NEW tables (point-in-time grants in 0002 don't cover them).
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.notification_prefs to authenticated;
grant all on public.push_subscriptions to service_role;
grant all on public.notification_prefs to service_role;
grant all on public.notifications_sent to service_role;
```

- [ ] **Step 2: Apply + verify**

Run:
```bash
cd /Users/vaamx/worldcup2026 && npx supabase db reset && npm run seed
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select tablename from pg_tables where schemaname='public' and tablename in ('push_subscriptions','notification_prefs','notifications_sent');"
docker exec "$DB" psql -U postgres -d postgres -c "select count(*) as policies from pg_policies where schemaname='public' and tablename in ('push_subscriptions','notification_prefs');"
```
Expected: 0001–0005 apply cleanly; 3 tables present; policies = 6 (3 push + 3 prefs).

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add supabase/migrations/0005_notifications.sql
git commit -m "feat(notify): notification tables (subscriptions, prefs, send-log) + RLS + grants"
```

---

## Task 2: Due-reminders selector (pure, TDD)

**Files:**
- Create: `lib/notify/select.ts`, `lib/notify/select.test.ts`

- [ ] **Step 1: Write the failing test `lib/notify/select.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { selectDueReminders } from "@/lib/notify/select";

const base = {
  dueMatches: [{ id: "GA-MEX-BEL", lockAtMs: 1_000 }],
  users: [
    { userId: "u1", push: true, email: true },
    { userId: "u2", push: false, email: false },
  ],
  predictedPairs: new Set<string>(),
  sentPairs: new Set<string>(),
};

describe("selectDueReminders", () => {
  it("includes a user's enabled channels for a due, unpredicted, un-sent match", () => {
    const out = selectDueReminders(base);
    expect(out).toEqual([{ userId: "u1", matchId: "GA-MEX-BEL", channels: ["push", "email"] }]);
  });

  it("skips users with no channel enabled", () => {
    const out = selectDueReminders(base);
    expect(out.find((r) => r.userId === "u2")).toBeUndefined();
  });

  it("skips a match the user already predicted", () => {
    const out = selectDueReminders({ ...base, predictedPairs: new Set(["u1:GA-MEX-BEL"]) });
    expect(out).toHaveLength(0);
  });

  it("does not re-send a channel already logged, but still sends the other", () => {
    const out = selectDueReminders({ ...base, sentPairs: new Set(["u1:GA-MEX-BEL:push"]) });
    expect(out).toEqual([{ userId: "u1", matchId: "GA-MEX-BEL", channels: ["email"] }]);
  });

  it("emits nothing when both channels were already sent", () => {
    const out = selectDueReminders({ ...base, sentPairs: new Set(["u1:GA-MEX-BEL:push", "u1:GA-MEX-BEL:email"]) });
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/notify/select.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/notify/select.ts`**

```typescript
export type Channel = "push" | "email";

export interface DueMatch {
  id: string;
  lockAtMs: number;
}
export interface NotifyUser {
  userId: string;
  push: boolean;
  email: boolean;
}
export interface SelectInput {
  dueMatches: DueMatch[];
  users: NotifyUser[];
  predictedPairs: Set<string>; // `${userId}:${matchId}`
  sentPairs: Set<string>;      // `${userId}:${matchId}:${channel}`
}
export interface Reminder {
  userId: string;
  matchId: string;
  channels: Channel[];
}

/**
 * Decide which lock-reminders to send: for each due match × user, the user's
 * enabled channels they haven't already been sent — unless they've predicted it.
 * Pure; the caller supplies "due" matches (already filtered to the time window).
 */
export function selectDueReminders(input: SelectInput): Reminder[] {
  const out: Reminder[] = [];
  for (const m of input.dueMatches) {
    for (const u of input.users) {
      if (input.predictedPairs.has(`${u.userId}:${m.id}`)) continue;
      const channels: Channel[] = [];
      if (u.push && !input.sentPairs.has(`${u.userId}:${m.id}:push`)) channels.push("push");
      if (u.email && !input.sentPairs.has(`${u.userId}:${m.id}:email`)) channels.push("email");
      if (channels.length > 0) out.push({ userId: u.userId, matchId: m.id, channels });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/notify/select.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/notify/select.ts lib/notify/select.test.ts
git commit -m "feat(notify): due-reminders selector with per-channel dedup (TDD)"
```

---

## Task 3: Notification templates (pure, TDD)

**Files:**
- Create: `lib/notify/templates.ts`, `lib/notify/templates.test.ts`

- [ ] **Step 1: Write the failing test `lib/notify/templates.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { lockReminderPush, lockReminderEmail } from "@/lib/notify/templates";

const match = { home: "Mexico", away: "Belgium", group: "A" };

describe("notification templates", () => {
  it("push payload has a title, body, and a deep link to /predict", () => {
    const p = lockReminderPush(match);
    expect(p.title).toMatch(/Mexico.*Belgium/);
    expect(p.body.toLowerCase()).toContain("lock");
    expect(p.url).toBe("/predict");
  });

  it("email has a subject and HTML body naming both teams", () => {
    const e = lockReminderEmail(match);
    expect(e.subject).toMatch(/Mexico|Belgium/);
    expect(e.html).toContain("Mexico");
    expect(e.html).toContain("Belgium");
    expect(e.html).toContain("</");
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/notify/templates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/notify/templates.ts`**

```typescript
export interface MatchInfo {
  home: string;
  away: string;
  group: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

/** Push notification for an upcoming lock. */
export function lockReminderPush(m: MatchInfo): PushPayload {
  return {
    title: `⏰ ${m.home} vs ${m.away}`,
    body: "Predict before it locks at kickoff!",
    url: "/predict",
  };
}

/** Email for an upcoming lock. */
export function lockReminderEmail(m: MatchInfo): { subject: string; html: string } {
  const where = m.group ? `Group ${m.group}` : "Knockout";
  return {
    subject: `⏰ ${m.home} vs ${m.away} — lock your prediction`,
    html: `<div style="font-family:system-ui,sans-serif">
  <h2>${m.home} vs ${m.away}</h2>
  <p>${where} · World Cup 2026. This match locks at kickoff — get your prediction in.</p>
  <p><a href="https://localhost/predict" style="background:#d4af37;color:#0a1428;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:800">Predict now</a></p>
</div>`,
  };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/notify/templates.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/notify/templates.ts lib/notify/templates.test.ts
git commit -m "feat(notify): lock-reminder push + email templates (TDD)"
```

---

## Task 4: Channel adapters (env-gated)

**Files:**
- Create: `lib/notify/push.ts`, `lib/notify/email.ts`
- Install: `web-push`, `resend`

- [ ] **Step 1: Install deps**

Run: `cd /Users/vaamx/worldcup2026 && npm install web-push resend && npm install -D @types/web-push`

- [ ] **Step 2: Write `lib/notify/push.ts`**

```typescript
import webpush from "web-push";

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured = false;
function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
  }
  return true;
}

/** Send a push payload to one subscription. Returns true if sent, false if skipped/failed.
 *  No-ops (returns false) when VAPID keys are absent. */
export async function sendPush(sub: PushSub, payload: object): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return true;
  } catch {
    return false; // expired/invalid subscription — caller may prune
  }
}
```

- [ ] **Step 3: Write `lib/notify/email.ts`**

```typescript
import { Resend } from "resend";

/** Send an email via Resend. No-ops (returns false) without RESEND_API_KEY. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM ?? "onboarding@resend.dev";
  if (!key) return false;
  try {
    const resend = new Resend(key);
    const { error } = await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return !error;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Type-check + commit**

```bash
cd /Users/vaamx/worldcup2026
npx tsc --noEmit
git add lib/notify/push.ts lib/notify/email.ts package.json package-lock.json
git commit -m "feat(notify): env-gated web-push + Resend channel adapters"
```

---

## Task 5: Dispatch + cron route

**Files:**
- Create: `lib/notify/dispatch.ts`, `app/api/cron/notify/route.ts`
- Modify: `vercel.json`, `.env.local.example`

- [ ] **Step 1: Write `lib/notify/dispatch.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectDueReminders, type NotifyUser } from "@/lib/notify/select";
import { lockReminderPush, lockReminderEmail } from "@/lib/notify/templates";
import { sendPush } from "@/lib/notify/push";
import { sendEmail } from "@/lib/notify/email";

const WINDOW_MS = 60 * 60 * 1000; // remind for matches locking within the next hour

/**
 * Send due lock-reminders across enabled channels and log each send for dedup.
 * Takes an injected service-role client (Node-safe). `nowMs` defaults to now.
 */
export async function dispatchReminders(admin: SupabaseClient, nowMs: number = Date.now()): Promise<{ sent: number }> {
  const horizon = new Date(nowMs + WINDOW_MS).toISOString();
  const now = new Date(nowMs).toISOString();

  const [matchesRes, teamsRes, prefsRes, predsRes, sentRes] = await Promise.all([
    admin.from("matches").select("id, home_team_id, away_team_id, group_label, lock_at, status")
      .eq("status", "scheduled").not("lock_at", "is", null).gte("lock_at", now).lte("lock_at", horizon),
    admin.from("teams").select("id, name"),
    admin.from("notification_prefs").select("user_id, push_enabled, email_enabled, email"),
    admin.from("predictions").select("user_id, match_id"),
    admin.from("notifications_sent").select("user_id, ref, channel").eq("kind", "lock"),
  ]);

  const dueMatches = (matchesRes.data ?? [])
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => ({ id: m.id, lockAtMs: new Date(m.lock_at as string).getTime() }));
  if (dueMatches.length === 0) return { sent: 0 };

  const nameById = new Map((teamsRes.data ?? []).map((t) => [t.id, t.name]));
  const matchInfo = new Map(
    (matchesRes.data ?? []).map((m) => [m.id, {
      home: nameById.get(m.home_team_id as string) ?? (m.home_team_id as string),
      away: nameById.get(m.away_team_id as string) ?? (m.away_team_id as string),
      group: m.group_label,
    }])
  );

  const users: NotifyUser[] = (prefsRes.data ?? [])
    .filter((p) => p.push_enabled || p.email_enabled)
    .map((p) => ({ userId: p.user_id, push: p.push_enabled, email: p.email_enabled && !!p.email }));
  const emailByUser = new Map((prefsRes.data ?? []).map((p) => [p.user_id, p.email]));

  const predictedPairs = new Set((predsRes.data ?? []).map((p) => `${p.user_id}:${p.match_id}`));
  const sentPairs = new Set((sentRes.data ?? []).map((s) => `${s.user_id}:${s.ref}:${s.channel}`));

  const reminders = selectDueReminders({ dueMatches, users, predictedPairs, sentPairs });

  let sent = 0;
  for (const r of reminders) {
    const info = matchInfo.get(r.matchId);
    if (!info) continue;
    for (const channel of r.channels) {
      let ok = false;
      if (channel === "push") {
        const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", r.userId);
        for (const s of subs ?? []) ok = (await sendPush(s, lockReminderPush(info))) || ok;
      } else {
        const to = emailByUser.get(r.userId);
        if (to) { const e = lockReminderEmail(info); ok = await sendEmail({ to, subject: e.subject, html: e.html }); }
      }
      if (ok) {
        await admin.from("notifications_sent").upsert(
          { user_id: r.userId, kind: "lock", ref: r.matchId, channel },
          { onConflict: "user_id,kind,ref,channel", ignoreDuplicates: true }
        );
        sent++;
      }
    }
  }
  return { sent };
}
```

- [ ] **Step 2: Write `app/api/cron/notify/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchReminders } from "@/lib/notify/dispatch";

export const dynamic = "force-dynamic";

/** CRON_SECRET-guarded lock-reminder dispatch. No-ops cleanly without VAPID/Resend keys. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { sent } = await dispatchReminders(createAdminClient());
    return NextResponse.json({ sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "notify failed";
    console.error("cron/notify failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add the notify cron to `vercel.json`**

Merge into the existing `crons` array:
```json
{
  "crons": [
    { "path": "/api/cron/poll-results", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/notify", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 4: Add env to `.env.local.example`**

Append:
```bash
# --- Notifications (optional; channels no-op until set) ---
# Web push: generate with `npx web-push generate-vapid-keys`
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # same value as VAPID_PUBLIC_KEY (exposed to the client)
# Email: a Resend API key + a verified sender (or onboarding@resend.dev for testing)
RESEND_API_KEY=
NOTIFY_EMAIL_FROM=onboarding@resend.dev
```

- [ ] **Step 5: Verify build + cron guard**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm run build
npm run dev >/tmp/n.log 2>&1 &
DEV=$!; for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -s -o /dev/null -w "no auth: %{http_code}\n" http://localhost:3000/api/cron/notify
curl -s -w "\nwith auth: %{http_code}\n" -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron/notify
kill $DEV 2>/dev/null
```
Expected: build succeeds; no-auth → 401; with-auth → 200 `{"sent":0}` (no prefs rows / no keys in dev → nothing to send).

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/notify/dispatch.ts app/api/cron/notify/route.ts vercel.json .env.local.example
git commit -m "feat(notify): dispatch (select→send→log) + CRON_SECRET notify route"
```

---

## Task 6: Service worker + subscribe client + settings UI

**Files:**
- Create: `public/sw.js`, `lib/notify/subscribe.ts`, `app/(app)/settings/page.tsx`, `app/(app)/settings/settings-client.tsx`
- Modify: `app/(app)/leagues/page.tsx`

- [ ] **Step 1: Write `public/sw.js`**

```javascript
// Service worker: show pushed notifications + focus the app on click.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "World Cup 2026";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 2: Write `lib/notify/subscribe.ts`**

```typescript
"use client";

import { createClient } from "@/lib/supabase/client";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Register the SW, request permission, subscribe, and persist the subscription.
 *  Returns true on success. */
export async function enablePush(userId: string): Promise<boolean> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushSupported() || !vapid) return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapid),
  });
  const json = sub.toJSON();
  const keys = json.keys ?? { p256dh: "", auth: "" };
  const supabase = createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: "user_id,endpoint" }
  );
  return !error;
}

/** Upsert the user's notification preferences. */
export async function savePrefs(userId: string, prefs: { push: boolean; email: boolean; email_addr?: string | null }): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from("notification_prefs").upsert(
    { user_id: userId, push_enabled: prefs.push, email_enabled: prefs.email, email: prefs.email_addr ?? null, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  return !error;
}
```

- [ ] **Step 3: Write `app/(app)/settings/settings-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import { enablePush, savePrefs, pushSupported } from "@/lib/notify/subscribe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SettingsClient({
  userId, initialPush, initialEmail, initialAddr,
}: {
  userId: string;
  initialPush: boolean;
  initialEmail: boolean;
  initialAddr: string | null;
}) {
  const [push, setPush] = useState(initialPush);
  const [email, setEmail] = useState(initialEmail);
  const [addr, setAddr] = useState(initialAddr ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function togglePush() {
    if (!push) {
      const ok = await enablePush(userId);
      if (!ok) { setStatus("Push unavailable (permission denied or not configured)."); return; }
    }
    const next = !push;
    setPush(next);
    await savePrefs(userId, { push: next, email, email_addr: addr || null });
    setStatus("Saved.");
  }

  async function saveEmail() {
    setEmail(true);
    await savePrefs(userId, { push, email: true, email_addr: addr || null });
    setStatus("Saved.");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">Push notifications</h2>
        <p className="text-sm text-white/60">Get a nudge before a match you haven&apos;t predicted locks.</p>
        {pushSupported() ? (
          <Button onClick={togglePush} variant={push ? "ghost" : "gold"}>{push ? "Disable push" : "Enable push"}</Button>
        ) : (
          <p className="text-xs text-white/40">Push isn&apos;t supported in this browser.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Email reminders</h2>
        <Input type="email" placeholder="you@example.com" value={addr} onChange={(e) => setAddr(e.target.value)} />
        <Button onClick={saveEmail} disabled={!addr}>Save email reminders</Button>
        {email && <p className="text-xs text-[var(--bn-success)]">Email reminders on.</p>}
      </Card>

      {status && <p className="text-center text-xs text-white/50">{status}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Write `app/(app)/settings/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: prefs } = await supabase
    .from("notification_prefs").select("push_enabled, email_enabled, email").eq("user_id", user.id).maybeSingle();

  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">SETTINGS</p>
        <h1 className="text-2xl font-black">Notifications</h1>
      </div>
      <SettingsClient
        userId={user.id}
        initialPush={prefs?.push_enabled ?? false}
        initialEmail={prefs?.email_enabled ?? false}
        initialAddr={prefs?.email ?? null}
      />
    </main>
  );
}
```

- [ ] **Step 5: Link to settings from `app/(app)/leagues/page.tsx`**

After the "Add to calendar" link, add:
```tsx
      <a href="/settings" className="block text-center text-sm font-semibold text-white/50 hover:text-white/80">
        🔔 Notification settings
      </a>
```

- [ ] **Step 6: Build + commit**

```bash
cd /Users/vaamx/worldcup2026
npm run build && npx tsc --noEmit
git add public/sw.js lib/notify/subscribe.ts "app/(app)/settings" "app/(app)/leagues/page.tsx"
git commit -m "feat(notify): service worker + push subscribe + notification settings UI"
```

---

## Task 7: Integration test + final verification

**Files:**
- Create: `lib/notify/dispatch.itest.ts`

- [ ] **Step 1: Write `lib/notify/dispatch.itest.ts`**

Proves the dispatch end-to-end EXCLUDING actual send (no keys in CI): a user with email prefs + an upcoming unpredicted match yields a reminder, and the dedup log prevents a second. Since `sendEmail` no-ops without `RESEND_API_KEY` (returns false → not logged → would re-select), this test asserts the **selector wiring** by seeding a `notifications_sent` row and confirming dispatch sends 0. It also asserts a fresh due match with prefs selects > 0 candidates via the pure selector against live data.

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { selectDueReminders } from "@/lib/notify/select";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("notification selection against live data (integration)", () => {
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;
  let userId: string;
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  beforeAll(async () => {
    const { data } = await admin.auth.admin.createUser({ email: `notif-${stamp}@example.com`, password: "Password123!", email_confirm: true });
    userId = data.user!.id;
    await admin.from("notification_prefs").upsert({ user_id: userId, push_enabled: false, email_enabled: true, email: `notif-${stamp}@example.com` });
    // Make a seeded R32 match lock in 30 min, teams resolved, unpredicted by this user.
    await admin.from("matches").update({ lock_at: future, status: "scheduled" }).eq("id", "GA-MEX-BEL");
  });

  afterAll(async () => {
    await admin.from("notification_prefs").delete().eq("user_id", userId);
    await admin.from("notifications_sent").delete().eq("user_id", userId);
  });

  it("selects a due reminder for an opted-in user who hasn't predicted, and dedups once sent", async () => {
    const dueMatches = [{ id: "GA-MEX-BEL", lockAtMs: new Date(future).getTime() }];
    const users = [{ userId, push: false, email: true }];

    const first = selectDueReminders({ dueMatches, users, predictedPairs: new Set(), sentPairs: new Set() });
    expect(first).toEqual([{ userId, matchId: "GA-MEX-BEL", channels: ["email"] }]);

    // After logging the send, it must not re-select.
    await admin.from("notifications_sent").upsert({ user_id: userId, kind: "lock", ref: "GA-MEX-BEL", channel: "email" });
    const { data: sent } = await admin.from("notifications_sent").select("user_id, ref, channel").eq("kind", "lock").eq("user_id", userId);
    const sentPairs = new Set((sent ?? []).map((s) => `${s.user_id}:${s.ref}:${s.channel}`));
    const second = selectDueReminders({ dueMatches, users, predictedPairs: new Set(), sentPairs });
    expect(second).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run integration**

Run: `cd /Users/vaamx/worldcup2026 && npm run seed && npm run test:integration`
Expected: prior suites + this one pass. (If `AuthRetryableFetchError`, `npx supabase stop && start`, health 200, retry.)

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/notify/dispatch.itest.ts
git commit -m "test(notify): integration — due-reminder selection + dedup against live data"
```

- [ ] **Step 4: Final gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                  # unit: prior 78 + select (5) + templates (2) = 85
npm run test:integration  # prior + notify selection
npm run build             # success; /api/cron/notify + /settings present
npx tsc --noEmit          # 0 errors
git status --short        # clean
```

- [ ] **Step 5: (Manual, once you have keys) end-to-end send check**

Document for the user (do not block on it): set `VAPID_*` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (from `npx web-push generate-vapid-keys`) and `RESEND_API_KEY`/`NOTIFY_EMAIL_FROM` in `.env.local`, restart `npm run dev`, open `/settings`, enable push (grant permission) and/or email; then `curl -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron/notify` and confirm `{"sent":N>0}` plus the notification/email arrives.

---

## Self-Review Notes (author)

- **Spec coverage (Phase-2 notifications):** push → Tasks 4–6 (SW + subscribe + web-push adapter); email → Tasks 3–5 (Resend adapter + templates); deadline reminders → Tasks 2,5 (selector + dispatch); preferences → Task 6 (settings UI + `notification_prefs`); dedup → Tasks 2,5 (`notifications_sent`). Calendar reminders already shipped in Plan 7.
- **Reuse:** the dispatch reuses the pure `selectDueReminders` + templates; channel adapters are isolated. The cron route mirrors the established `CRON_SECRET` guard + try/catch from `poll-results`.
- **Env-gated, build-now:** both adapters return `false` (no-op) without keys, so the whole system builds, the cron route returns `{"sent":0}`, and CI passes WITHOUT any secrets — sends light up when the user adds VAPID/Resend keys. Mirrors the football-data adapter pattern.
- **Security/grants:** the 3 new tables ship their OWN RLS policies + least-privilege grants in migration 0005 (the point-in-time grants in 0002 don't extend to new tables — the Plan-2 lesson). `notifications_sent` is service-role only. Subscriptions/prefs are own-row. The dispatch + send-log writes go through the injected service-role client (Node-safe; no `server-only` import in `dispatch.ts`).
- **Dedup correctness:** a send is logged per `(user, kind, ref, channel)` only when the channel actually succeeded; the selector excludes already-logged channels, so re-runs never double-send. A failed send isn't logged, so it's retried next cron — intended.
- **Deferred-by-design (NOT gaps):** rank-change / weekly-recap notifications (the infra — selector shape, adapters, log — generalizes to new `kind`s later); subscription pruning on `web-push` 410/expired (adapter returns false; a cleanup pass can prune); rich email templates. End-to-end send verification requires the user's keys (documented manual step).
- **Type/name consistency:** `Channel`/`NotifyUser`/`Reminder` shared between `select.ts`, its test, and `dispatch.ts`; `PushPayload`/`MatchInfo` between `templates.ts` and `dispatch.ts`; `sendPush`/`sendEmail` signatures match between adapters and `dispatch.ts`; the `notifications_sent` PK `(user_id,kind,ref,channel)` matches the upsert `onConflict`.
```