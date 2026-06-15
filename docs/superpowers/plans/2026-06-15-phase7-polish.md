# Phase 1 — Plan 7: Game-Feel Polish + Calendar Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app feel like a fun game — badges & streaks, a champion-pick celebration, exact-score moments, and per-match ✓/✗ — plus add-to-calendar deadline reminders and PWA installability.

**Architecture:** A pure, tested achievements engine derives badges + streak from a user's scored predictions; the scoring run upserts them. The group-prediction UI shows ✓/✗ once a match is final (results already in the view-model). A celebration layer fires confetti on a champion pick and an exact-score toast, gated by a mute preference (with haptics). A pure `.ics` generator + a route give "add to calendar" deadline reminders. A web manifest makes the app installable.

**Tech Stack:** TypeScript, the existing `lib/math` module, Supabase (achievements table + service-role upsert in the scoring run), `canvas-confetti`, Next.js 16 route handler + `app/manifest.ts`, Vitest.

**Scope note — deferred to Plan 8 (need external setup):** **push notifications** (VAPID keys + service worker) and **email** (Resend account/cron). This plan lays the PWA-install foundation push will build on. Also deferred: per-tie ✓/✗ on the *knockout bracket* (set-based correctness is reflected in the leaderboard; clean per-tie display is a later refinement) and audio (needs sound assets) — haptics + confetti cover the feel.

---

## File Structure

```
lib/achievements/badges.ts                      # badge keys + display metadata (labels/emoji)
lib/achievements/compute.ts  + .test.ts          # pure computeAchievements (badges + streak) — TDD
lib/achievements/queries.ts                     # getEarnedBadges(userId)
lib/scoring/run.ts                              # MODIFY: upsert achievements per user
components/predict/MatchRow.tsx                  # MODIFY: ✓/✗ result indicator when final
lib/celebrate/useCelebration.ts                  # confetti + haptics, gated by a mute pref
components/bracket/bracket-client.tsx (app/(app)/bracket/) # MODIFY: confetti on champion pick
components/ui/BadgeStrip.tsx                      # earned-badges row
app/(app)/leagues/page.tsx                        # MODIFY: render BadgeStrip + add-to-calendar link
lib/calendar/ics.ts          + .test.ts          # pure .ics (VCALENDAR) generator — TDD
app/api/calendar/route.ts                        # serves upcoming match deadlines as .ics
app/manifest.ts                                  # PWA web manifest
public/icon.svg                                  # app icon (simple SVG)
```

---

## Task 1: Achievements engine (pure, TDD)

**Files:**
- Create: `lib/achievements/badges.ts`, `lib/achievements/compute.ts`, `lib/achievements/compute.test.ts`

- [ ] **Step 1: Write `lib/achievements/badges.ts`**

```typescript
/** Badge keys (stored in achievements.badge_key) + display metadata. */
export const BADGES = {
  bullseye: { key: "bullseye", emoji: "🎯", label: "Bullseye", desc: "Nailed an exact scoreline" },
  sharpshooter: { key: "sharpshooter", emoji: "🎯", label: "Sharpshooter", desc: "5+ exact scorelines" },
  perfect_group: { key: "perfect_group", emoji: "🧩", label: "Perfect Group", desc: "Every match in a group spot-on" },
  hot_streak: { key: "hot_streak", emoji: "🔥", label: "On Fire", desc: "3 exact scorelines in a row" },
  oracle: { key: "oracle", emoji: "🔮", label: "Oracle", desc: "Called the champion" },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_LIST = Object.values(BADGES);
```

- [ ] **Step 2: Write the failing test `lib/achievements/compute.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { computeAchievements } from "@/lib/achievements/compute";

type M = Parameters<typeof computeAchievements>[0]["groupMatches"][number];
function m(id: string, group: string, kickoff: string, hs: number | null, as: number | null): M {
  return { id, group_label: group, kickoff_at: kickoff, home_score: hs, away_score: as, status: hs === null ? "scheduled" : "final" };
}

describe("computeAchievements", () => {
  it("awards bullseye for one exact and tracks streak", () => {
    const groupMatches = [m("g1", "A", "2026-06-11T18:00:00Z", 2, 1)];
    const predictions = [{ match_id: "g1", predicted_home: 2, predicted_away: 1 }];
    const r = computeAchievements({ groupMatches, predictions });
    expect(r.badges).toContain("bullseye");
    expect(r.longestStreak).toBe(1);
  });

  it("awards sharpshooter at 5 exact and hot_streak at 3 in a row", () => {
    const groupMatches = Array.from({ length: 6 }, (_, i) => m(`g${i}`, "A", `2026-06-11T${10 + i}:00:00Z`, 1, 0));
    // Predict the first 5 exactly (consecutive), miss the 6th.
    const predictions = groupMatches.map((gm, i) => ({ match_id: gm.id, predicted_home: i < 5 ? 1 : 9, predicted_away: 0 }));
    const r = computeAchievements({ groupMatches, predictions });
    expect(r.badges).toEqual(expect.arrayContaining(["bullseye", "sharpshooter", "hot_streak"]));
    expect(r.longestStreak).toBe(5);
  });

  it("awards perfect_group only when all six of a group are exact", () => {
    const groupMatches = Array.from({ length: 6 }, (_, i) => m(`g${i}`, "A", `2026-06-11T${10 + i}:00:00Z`, 2, 0));
    const allRight = groupMatches.map((gm) => ({ match_id: gm.id, predicted_home: 2, predicted_away: 0 }));
    expect(computeAchievements({ groupMatches, predictions: allRight }).badges).toContain("perfect_group");
    const oneWrong = allRight.map((p, i) => (i === 0 ? { ...p, predicted_home: 0 } : p));
    expect(computeAchievements({ groupMatches, predictions: oneWrong }).badges).not.toContain("perfect_group");
  });

  it("awards oracle for the correct champion pick", () => {
    const r = computeAchievements({ groupMatches: [], predictions: [], finalWinnerTeamId: "BRA", finalPickTeamId: "BRA" });
    expect(r.badges).toContain("oracle");
    const wrong = computeAchievements({ groupMatches: [], predictions: [], finalWinnerTeamId: "BRA", finalPickTeamId: "ARG" });
    expect(wrong.badges).not.toContain("oracle");
  });

  it("breaks the streak on a miss", () => {
    const gm = [
      m("a", "A", "2026-06-11T10:00:00Z", 1, 0),
      m("b", "A", "2026-06-11T11:00:00Z", 1, 0),
      m("c", "A", "2026-06-11T12:00:00Z", 1, 0), // miss
      m("d", "A", "2026-06-11T13:00:00Z", 1, 0),
    ];
    const preds = [
      { match_id: "a", predicted_home: 1, predicted_away: 0 },
      { match_id: "b", predicted_home: 1, predicted_away: 0 },
      { match_id: "c", predicted_home: 5, predicted_away: 0 },
      { match_id: "d", predicted_home: 1, predicted_away: 0 },
    ];
    expect(computeAchievements({ groupMatches: gm, predictions: preds }).longestStreak).toBe(2);
  });
});
```

- [ ] **Step 3: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/achievements/compute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lib/achievements/compute.ts`**

```typescript
export interface AchievementInput {
  groupMatches: {
    id: string;
    group_label: string | null;
    kickoff_at: string | null;
    home_score: number | null;
    away_score: number | null;
    status: string;
  }[];
  predictions: { match_id: string; predicted_home: number | null; predicted_away: number | null }[];
  finalWinnerTeamId?: string | null; // actual champion (F-1 winner)
  finalPickTeamId?: string | null;    // user's predicted champion (F-1 pick)
}

/** Derive earned badge keys + the user's longest exact-score streak. Pure. */
export function computeAchievements(input: AchievementInput): { badges: string[]; longestStreak: number } {
  const predBy = new Map(input.predictions.map((p) => [p.match_id, p]));
  const finals = input.groupMatches
    .filter((m) => m.status === "final" && m.home_score !== null && m.away_score !== null)
    .sort((a, b) => (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? ""));

  let exactTotal = 0;
  let cur = 0;
  let longestStreak = 0;
  const exactByGroup = new Map<string, number>();
  const finalsByGroup = new Map<string, number>();

  for (const m of finals) {
    if (m.group_label) finalsByGroup.set(m.group_label, (finalsByGroup.get(m.group_label) ?? 0) + 1);
    const p = predBy.get(m.id);
    const exact = !!p && p.predicted_home === m.home_score && p.predicted_away === m.away_score;
    if (exact) {
      exactTotal++;
      cur++;
      longestStreak = Math.max(longestStreak, cur);
      if (m.group_label) exactByGroup.set(m.group_label, (exactByGroup.get(m.group_label) ?? 0) + 1);
    } else {
      cur = 0;
    }
  }

  const badges: string[] = [];
  if (exactTotal >= 1) badges.push("bullseye");
  if (exactTotal >= 5) badges.push("sharpshooter");
  for (const [g, count] of finalsByGroup) {
    if (count === 6 && exactByGroup.get(g) === 6) {
      badges.push("perfect_group");
      break;
    }
  }
  if (longestStreak >= 3) badges.push("hot_streak");
  if (input.finalWinnerTeamId && input.finalPickTeamId && input.finalWinnerTeamId === input.finalPickTeamId) {
    badges.push("oracle");
  }
  return { badges, longestStreak };
}
```

- [ ] **Step 5: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/achievements/compute.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/achievements/badges.ts lib/achievements/compute.ts lib/achievements/compute.test.ts
git commit -m "feat(achievements): badges + streak engine (TDD)"
```

---

## Task 2: Wire achievements into the scoring run + earned-badges query

**Files:**
- Modify: `lib/scoring/run.ts`
- Create: `lib/achievements/queries.ts`

- [ ] **Step 1: Upsert achievements per user in `runScoring`**

In `lib/scoring/run.ts`, add the import:
```typescript
import { computeAchievements } from "@/lib/achievements/compute";
```
After the per-league standings loop completes (just before `return { leagues, rows }`), add a once-per-user achievements pass. `matches` (group), `teams`, `predsByUser`, `koMatches`, and `koPredsByUser` are already in scope:
```typescript
  // Achievements are global (derived from a user's predictions vs real results),
  // so compute once per user and upsert (existing badges are kept via do-nothing).
  const finalChampion = koMatches.find((m) => m.id === "F-1" && m.status === "final")?.winner_team_id ?? null;
  const allUserIds = new Set<string>([...predsByUser.keys(), ...koPredsByUser.keys()]);
  const badgeRows: { user_id: string; badge_key: string }[] = [];
  for (const userId of allUserIds) {
    const { badges } = computeAchievements({
      groupMatches: matches.map((m) => ({
        id: m.id, group_label: m.group_label, kickoff_at: (m as { kickoff_at?: string | null }).kickoff_at ?? null,
        home_score: m.home_score, away_score: m.away_score, status: m.status,
      })),
      predictions: predsByUser.get(userId) ?? [],
      finalWinnerTeamId: finalChampion,
      finalPickTeamId: koPredsByUser.get(userId)?.get("F-1") ?? null,
    });
    for (const key of badges) badgeRows.push({ user_id: userId, badge_key: key });
  }
  if (badgeRows.length > 0) {
    const { error } = await admin.from("achievements").upsert(badgeRows, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
    if (error) throw error;
  }
```
NOTE: the group `matches` query in `runScoring` currently selects `id, group_label, home_team_id, away_team_id, home_score, away_score, status`. Add `kickoff_at` to that `.select(...)` string so the achievement streak can order by kickoff. (The cast above tolerates its absence, but add the column for correct ordering.)

- [ ] **Step 2: Write `lib/achievements/queries.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";

/** Badge keys the signed-in user has earned. */
export async function getEarnedBadges(): Promise<string[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("achievements").select("badge_key").eq("user_id", user.id);
  return (data ?? []).map((r) => r.badge_key);
}
```

- [ ] **Step 3: Type-check + verify scoring still runs**

Run:
```bash
cd /Users/vaamx/worldcup2026
npx tsc --noEmit
npm run seed && npm run simulate   # runs runScoring incl. the achievements upsert
DB=$(docker ps --format '{{.Names}}' | grep supabase_db)
docker exec "$DB" psql -U postgres -d postgres -c "select badge_key, count(*) from public.achievements group by badge_key;"
```
Expected: 0 type errors; simulate completes; some badge rows exist (bullseye/etc. for users with exact predictions — may be empty if no test users predicted exactly, which is fine).

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/scoring/run.ts lib/achievements/queries.ts
git commit -m "feat(achievements): upsert badges in the scoring run + earned-badges query"
```

---

## Task 3: ✓/✗ result indicator on group predictions

**Files:**
- Modify: `components/predict/MatchRow.tsx`

- [ ] **Step 1: Add a result verdict to `components/predict/MatchRow.tsx`**

When `match.status === "final"` and the user predicted, show a small verdict chip: 🎯 (exact), ✓ (right result), or ✗ (wrong). Add this near the top of the component body (it already has `match`, `home`, `away`):
```tsx
import { outcomeOf } from "@/lib/math";
```
Compute inside the component (before the `return`):
```tsx
  const final = match.status === "final" && match.homeScore !== null && match.awayScore !== null;
  const predicted = match.predictedHome !== null && match.predictedAway !== null;
  let verdict: "exact" | "result" | "miss" | null = null;
  if (final && predicted) {
    const exact = match.predictedHome === match.homeScore && match.predictedAway === match.awayScore;
    const sameOutcome =
      outcomeOf(match.predictedHome as number, match.predictedAway as number) ===
      outcomeOf(match.homeScore as number, match.awayScore as number);
    verdict = exact ? "exact" : sameOutcome ? "result" : "miss";
  }
```
Then render the chip in the row (e.g., centered above/below the score inputs, or to the right). Add this just inside the outer wrapper:
```tsx
      {verdict && (
        <span
          className={
            "absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold " +
            (verdict === "exact"
              ? "bg-[var(--bn-gold)] text-[#0a1428]"
              : verdict === "result"
              ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)]"
              : "bg-red-500/20 text-red-400")
          }
        >
          {verdict === "exact" ? "🎯 EXACT" : verdict === "result" ? "✓" : "✗"}
        </span>
      )}
```
Make the row wrapper `relative` so the chip positions correctly (the outer `div` currently `flex items-center justify-between …` — add `relative` to its className).

- [ ] **Step 2: Build to verify**

Run: `cd /Users/vaamx/worldcup2026 && npm run build && npx tsc --noEmit`
Expected: build succeeds; 0 type errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/predict/MatchRow.tsx
git commit -m "feat(predict): per-match ✓/✗/exact verdict once a match is final"
```

---

## Task 4: Celebration layer — confetti + haptics + champion pop

**Files:**
- Create: `lib/celebrate/useCelebration.ts`
- Modify: `app/(app)/bracket/bracket-client.tsx`

- [ ] **Step 1: Install canvas-confetti**

Run: `cd /Users/vaamx/worldcup2026 && npm install canvas-confetti && npm install -D @types/canvas-confetti`

- [ ] **Step 2: Write `lib/celebrate/useCelebration.ts`**

```typescript
"use client";

import { useCallback } from "react";

const MUTE_KEY = "wc26-mute";

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}
export function setMuted(muted: boolean): void {
  if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Confetti burst + a short haptic, unless the user has muted celebrations. */
export function useCelebration() {
  return useCallback(async (intensity: "small" | "big" = "small") => {
    if (isMuted()) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(intensity === "big" ? [20, 40, 20] : 15);
    }
    const confetti = (await import("canvas-confetti")).default;
    const count = intensity === "big" ? 200 : 60;
    confetti({ particleCount: count, spread: intensity === "big" ? 100 : 60, origin: { y: 0.7 }, colors: ["#d4af37", "#f4d56a", "#7c5cff", "#ffffff"] });
  }, []);
}
```

- [ ] **Step 3: Fire confetti on a champion pick in `app/(app)/bracket/bracket-client.tsx`**

Import and use the hook; trigger a big celebration when the user picks the Final (F-1) winner. In `onPick`, after `setPicks(pruned)`:
```tsx
    if (matchId === "F-1") celebrate("big");
```
Add at the top of the component:
```tsx
import { useCelebration } from "@/lib/celebrate/useCelebration";
// ...
  const celebrate = useCelebration();
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/vaamx/worldcup2026
npm run build && npx tsc --noEmit
git add lib/celebrate/useCelebration.ts "app/(app)/bracket/bracket-client.tsx" package.json package-lock.json
git commit -m "feat(celebrate): confetti + haptics on champion pick (muteable)"
```

---

## Task 5: Calendar (.ics) reminders

**Files:**
- Create: `lib/calendar/ics.ts`, `lib/calendar/ics.test.ts`, `app/api/calendar/route.ts`
- Modify: `app/(app)/leagues/page.tsx`

- [ ] **Step 1: Write the failing test `lib/calendar/ics.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildIcs } from "@/lib/calendar/ics";

describe("buildIcs", () => {
  const events = [
    { uid: "GA-MEX-BEL", start: "2026-06-11T18:00:00Z", summary: "Mexico vs Belgium — predict by kickoff", description: "World Cup 2026 · Group A" },
  ];

  it("wraps events in a VCALENDAR with one VEVENT", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it("formats the start as a UTC timestamp and includes uid + summary", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics).toContain("DTSTART:20260611T180000Z");
    expect(ics).toContain("UID:GA-MEX-BEL");
    expect(ics).toContain("SUMMARY:Mexico vs Belgium — predict by kickoff");
  });

  it("escapes commas and newlines in text fields", () => {
    const ics = buildIcs([{ uid: "x", start: "2026-06-11T18:00:00Z", summary: "A, B", description: "line1\nline2" }], "2026-06-01T00:00:00Z");
    expect(ics).toContain("SUMMARY:A\\, B");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  it("uses CRLF line endings (RFC 5545)", () => {
    const ics = buildIcs(events, "2026-06-01T00:00:00Z");
    expect(ics.includes("\r\n")).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/calendar/ics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/calendar/ics.ts`**

```typescript
export interface IcsEvent {
  uid: string;
  start: string; // ISO timestamp
  summary: string;
  description?: string;
}

/** Format an ISO timestamp as an iCalendar UTC value: YYYYMMDDTHHMMSSZ. */
function toIcsUtc(iso: string): string {
  const digits = iso.replace(/[-:]/g, ""); // 2026-06-11T18:00:00Z -> 20260611T180000Z (or with .000Z)
  const m = digits.match(/(\d{8}T\d{6})/);
  return m ? `${m[1]}Z` : digits;
}

/** Escape iCalendar TEXT (RFC 5545 §3.3.11). */
function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** Build a VCALENDAR document with one VEVENT per event. `dtstamp` is the ISO "now". */
export function buildIcs(events: IcsEvent[], dtstamp: string): string {
  const stamp = toIcsUtc(dtstamp);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bracket Royale//WC2026//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(e.start)}`,
      `SUMMARY:${esc(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/calendar/ics.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Write `app/api/calendar/route.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";
import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";

export const dynamic = "force-dynamic";

/** Upcoming match deadlines as a downloadable .ics calendar. */
export async function GET() {
  const supabase = await createClient();
  const { data: matches } = await supabase
    .from("matches")
    .select("id, home_team_id, away_team_id, group_label, stage, lock_at, status")
    .eq("status", "scheduled")
    .not("lock_at", "is", null)
    .order("lock_at", { ascending: true })
    .limit(100);
  const { data: teams } = await supabase.from("teams").select("id, name");
  const nameById = new Map((teams ?? []).map((t) => [t.id, t.name]));

  const events: IcsEvent[] = (matches ?? [])
    .filter((m) => m.home_team_id && m.away_team_id)
    .map((m) => {
      const home = nameById.get(m.home_team_id as string) ?? m.home_team_id;
      const away = nameById.get(m.away_team_id as string) ?? m.away_team_id;
      return {
        uid: `${m.id}@bracket-royale`,
        start: m.lock_at as string,
        summary: `${home} vs ${away} — lock your prediction`,
        description: m.group_label ? `World Cup 2026 · Group ${m.group_label}` : `World Cup 2026 · ${m.stage.toUpperCase()}`,
      };
    });

  const ics = buildIcs(events, new Date().toISOString());
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="worldcup2026-deadlines.ics"',
    },
  });
}
```

- [ ] **Step 6: Add an "Add to calendar" link in `app/(app)/leagues/page.tsx`**

After the bracket entry link, add:
```tsx
      <a href="/api/calendar" className="block text-center text-sm font-semibold text-white/50 hover:text-white/80">
        📅 Add match deadlines to your calendar
      </a>
```

- [ ] **Step 7: Build + commit**

```bash
cd /Users/vaamx/worldcup2026
npm run build && npx tsc --noEmit
git add lib/calendar "app/api/calendar/route.ts" "app/(app)/leagues/page.tsx"
git commit -m "feat(calendar): .ics deadline reminders (TDD) + add-to-calendar route"
```

---

## Task 6: Badge strip, PWA manifest, final verification

**Files:**
- Create: `components/ui/BadgeStrip.tsx`, `app/manifest.ts`, `public/icon.svg`
- Modify: `app/(app)/leagues/page.tsx`

- [ ] **Step 1: Write `components/ui/BadgeStrip.tsx`**

```tsx
import { BADGES, type BadgeKey } from "@/lib/achievements/badges";

export function BadgeStrip({ earned }: { earned: string[] }) {
  if (earned.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {earned.map((key) => {
        const b = BADGES[key as BadgeKey];
        if (!b) return null;
        return (
          <span key={key} title={b.desc} className="inline-flex items-center gap-1 rounded-full border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/10 px-2.5 py-1 text-xs font-bold text-[var(--bn-gold)]">
            <span aria-hidden>{b.emoji}</span> {b.label}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render the strip on `app/(app)/leagues/page.tsx`**

Import `getEarnedBadges` + `BadgeStrip`; fetch badges and render the strip under the header:
```tsx
import { getEarnedBadges } from "@/lib/achievements/queries";
import { BadgeStrip } from "@/components/ui/BadgeStrip";
// inside the component, alongside the other awaits:
  const badges = await getEarnedBadges();
// in JSX, right after </header>:
      <BadgeStrip earned={badges} />
```

- [ ] **Step 3: Write `public/icon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#0a1428"/>
  <text x="50%" y="54%" font-size="300" text-anchor="middle" dominant-baseline="middle">🏆</text>
</svg>
```

- [ ] **Step 4: Write `app/manifest.ts`**

```typescript
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bracket Royale · World Cup 2026 Predictions",
    short_name: "Bracket Royale",
    description: "Predict every match, build your bracket, climb the leaderboard.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1428",
    theme_color: "#0a1428",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
```

- [ ] **Step 5: Final gates**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                  # unit: prior 69 + achievements (5) + ics (4) = 78
npm run test:integration  # unchanged (11)
npm run build             # success; /api/calendar, /manifest.webmanifest present
npx tsc --noEmit          # 0 errors
git status --short        # clean
```

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add components/ui/BadgeStrip.tsx app/manifest.ts public/icon.svg "app/(app)/leagues/page.tsx"
git commit -m "feat(polish): badge strip + PWA manifest + app icon"
```

---

## Self-Review Notes (author)

- **Spec coverage (Phase-2/polish):** streaks & badges → Tasks 1–2, 6; 🎯 exact moment + ✓/✗ → Task 3; confetti + haptics on champion → Task 4; calendar reminders → Task 5; PWA installability → Task 6. The original spec's signature "fun" moments (spring table re-sort, rank-change animation) already shipped in Plans 3–4.
- **Reuse:** the achievements engine + the ✓/✗ verdict reuse `outcomeOf`/exact-equality (same definitions as the scoring engine); no duplicated scoring rules. The `.ics` generator is standalone and pure.
- **Deferred-by-design (NOT gaps) → Plan 8:** push notifications (VAPID + service worker), email (Resend + cron) — both need external accounts/keys; this plan ships the PWA manifest they build on. Also deferred: per-tie knockout ✓/✗ (set-based correctness shows in the leaderboard), and audio (needs sound assets — haptics + confetti cover the feel).
- **Idempotency/safety:** achievements upsert uses `ignoreDuplicates` on `(user_id, badge_key)` so re-running the scoring run never duplicates or un-earns a badge. The calendar route reads only scheduled, team-resolved matches. Confetti import is dynamic (no SSR cost) and gated by a mute pref.
- **Type/name consistency:** `BadgeKey`/`BADGES` shared between `badges.ts`, `compute` (string keys), and `BadgeStrip`; `computeAchievements` input shape matches its test and the `run.ts` call site; `IcsEvent`/`buildIcs(events, dtstamp)` match between `ics.ts`, its test, and the route.
```
