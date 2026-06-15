# Phase 1 — Plan 6: Bracket UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once the group stage decides the real Round-of-32, let a signed-in (or guest) user fill their entire knockout bracket — picking a winner per tie, propagating forward through R16 → QF → SF → Final to a champion — saved under RLS.

**Architecture:** A pure `buildBracketView` propagates the user's winner picks through the existing feeds tree (R32 teams are real/fixed; every later slot's teams come from the user's upstream picks) and prunes any downstream pick invalidated by an upstream change. A server query assembles the bracket view-model (KO matches + team display info + the user's picks + a "resolved yet?" gate). A mobile-first round stepper (R32 → Final) shows one round's ties at a time; tapping a team picks the winner and autosaves `predictions.predicted_winner_team_id` via the browser client (and deletes picks the change invalidated). Until the R32 is resolved, the screen shows a locked "unlocks when the group stage finishes" state.

**Tech Stack:** Next.js 16 App Router (server query + client bracket), React 19, Tailwind v4, Framer Motion, the existing `lib/bracket/structure` feeds tree, Supabase browser client + RLS, Vitest (unit + integration).

**Scope note:** The bracket shows the user's *predicted* tree (their picks), per the "full bracket upfront" spec. Showing ✓/✗ of picks against actual results, and a fancy full-tree SVG on large screens, are **Plan 7 polish**. KO picks are winner-only (no scoreline), matching Plan 5.

---

## File Structure

```
lib/bracket/userBracket.ts  + .test.ts          # pure buildBracketView (propagate + prune) — TDD
lib/bracket/queries.ts                          # server: KO matches + teams + user picks + resolved flag
components/bracket/TieCard.tsx                   # one tie: two tappable team rows + winner highlight
components/bracket/RoundStepper.tsx              # R32→Final round nav + progress
app/(app)/bracket/page.tsx                       # server: load view-model, gate auth, render
app/(app)/bracket/bracket-client.tsx             # client: picks state, prune, autosave, round stepper
app/(app)/leagues/page.tsx                        # MODIFY: add a "Build your bracket" entry link
lib/bracket/userBracket.itest.ts                 # integration: a KO pick saves under RLS
```

---

## Task 1: `buildBracketView` — propagate + prune (pure, TDD)

**Files:**
- Create: `lib/bracket/userBracket.ts`, `lib/bracket/userBracket.test.ts`

- [ ] **Step 1: Write the failing test `lib/bracket/userBracket.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildBracketView } from "@/lib/bracket/userBracket";

// Minimal R32 fixture: only the two ties that feed R16-1.
const r32 = {
  "R32-1": { homeTeamId: "A", awayTeamId: "B" },
  "R32-2": { homeTeamId: "C", awayTeamId: "D" },
};

describe("buildBracketView", () => {
  it("propagates R32 winner picks into the R16 slots", () => {
    const { view } = buildBracketView(r32, { "R32-1": "A", "R32-2": "C" });
    expect(view["R16-1"].homeTeamId).toBe("A");
    expect(view["R16-1"].awayTeamId).toBe("C");
  });

  it("keeps a valid pick and exposes it on the view", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "A" });
    expect(view["R32-1"].pick).toBe("A");
    expect(validPicks["R32-1"]).toBe("A");
  });

  it("ignores a pick that isn't one of the tie's two teams", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "Z" });
    expect(view["R32-1"].pick).toBeUndefined();
    expect(validPicks["R32-1"]).toBeUndefined();
  });

  it("prunes a downstream pick when an upstream change removes its team", () => {
    // User picked A into R16-1 and then picked A to win R16-1.
    let picks: Record<string, string> = { "R32-1": "A", "R32-2": "C", "R16-1": "A" };
    expect(buildBracketView(r32, picks).validPicks["R16-1"]).toBe("A");
    // Now change R32-1 to B: A is no longer in R16-1, so the R16-1 pick is pruned.
    picks = { ...picks, "R32-1": "B" };
    const { view, validPicks } = buildBracketView(r32, picks);
    expect(view["R16-1"].homeTeamId).toBe("B");
    expect(validPicks["R16-1"]).toBeUndefined();
  });

  it("propagates SF winners to the final and SF losers to the third-place match", () => {
    // Full 16-tie fixture; picking every HOME team makes the bracket deterministic.
    const full: Record<string, { homeTeamId: string; awayTeamId: string }> = {};
    for (let n = 1; n <= 16; n++) full[`R32-${n}`] = { homeTeamId: `h${n}`, awayTeamId: `a${n}` };

    const picks: Record<string, string> = {};
    for (let n = 1; n <= 16; n++) picks[`R32-${n}`] = `h${n}`;        // R32 winners: h1..h16
    for (let n = 1; n <= 8; n++) picks[`R16-${n}`] = `h${2 * n - 1}`; // R16 home = h(2n-1)
    for (let n = 1; n <= 4; n++) picks[`QF-${n}`] = `h${4 * n - 3}`;  // QF home = h(4n-3): h1,h5,h9,h13
    // SF-1 = {h1 (QF-1), h5 (QF-2)}; SF-2 = {h9 (QF-3), h13 (QF-4)}.
    picks["SF-1"] = "h1"; // loser h5
    picks["SF-2"] = "h9"; // loser h13

    const { view } = buildBracketView(full, picks);
    expect(view["F-1"]).toMatchObject({ homeTeamId: "h1", awayTeamId: "h9" });
    expect(view["3RD-1"]).toMatchObject({ homeTeamId: "h5", awayTeamId: "h13" });
  });
});
```

- [ ] **Step 2: Run and confirm fail**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/userBracket.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/bracket/userBracket.ts`**

```typescript
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";

export interface BracketSlotView {
  homeTeamId?: string;
  awayTeamId?: string;
  pick?: string;
}

export interface R32Teams {
  [matchId: string]: { homeTeamId: string | null; awayTeamId: string | null };
}

/**
 * Build the user's predicted bracket from the real R32 teams + their winner picks.
 * Teams for R16+ are derived by propagating each match's pick through the feeds
 * tree (and semifinal losers into the third-place match). A pick is valid only if
 * it is one of its tie's two current teams; invalid (e.g. orphaned by an upstream
 * change) picks are pruned and excluded from `validPicks`.
 */
export function buildBracketView(
  r32Teams: R32Teams,
  picks: Record<string, string>
): { view: Record<string, BracketSlotView>; validPicks: Record<string, string> } {
  // Accumulate slot teams as we process rounds in order.
  const slots: Record<string, { homeTeamId?: string; awayTeamId?: string }> = {};
  for (const [id, t] of Object.entries(r32Teams)) {
    slots[id] = { homeTeamId: t.homeTeamId ?? undefined, awayTeamId: t.awayTeamId ?? undefined };
  }

  const view: Record<string, BracketSlotView> = {};
  const validPicks: Record<string, string> = {};

  const place = (feedMatchId: string, side: "home" | "away", teamId: string) => {
    const cur = slots[feedMatchId] ?? {};
    if (side === "home") cur.homeTeamId = teamId;
    else cur.awayTeamId = teamId;
    slots[feedMatchId] = cur;
  };

  for (const m of KNOCKOUT_MATCHES) {
    const slot = slots[m.id] ?? {};
    const { homeTeamId, awayTeamId } = slot;
    const pick = picks[m.id];
    const valid = pick !== undefined && (pick === homeTeamId || pick === awayTeamId);

    view[m.id] = { homeTeamId, awayTeamId, pick: valid ? pick : undefined };
    if (valid) {
      validPicks[m.id] = pick;
      if (m.winnerTo) place(m.winnerTo.matchId, m.winnerTo.side, pick);
      if (m.loserTo) {
        const loser = pick === homeTeamId ? awayTeamId : homeTeamId;
        if (loser) place(m.loserTo.matchId, m.loserTo.side, loser);
      }
    }
  }

  return { view, validPicks };
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run lib/bracket/userBracket.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/userBracket.ts lib/bracket/userBracket.test.ts
git commit -m "feat(bracket): buildBracketView — propagate picks + prune invalid (TDD)"
```

---

## Task 2: Bracket view-model + server query

**Files:**
- Create: `lib/bracket/queries.ts`

- [ ] **Step 1: Write `lib/bracket/queries.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";

export interface BracketTeam {
  name: string;
  flag: string | null;
}
export interface BracketMatchRow {
  id: string;
  stage: "r32" | "r16" | "qf" | "sf" | "final" | "third";
  homeTeamId: string | null;
  awayTeamId: string | null;
  lockAt: string | null;
  status: "scheduled" | "live" | "final";
  winnerTeamId: string | null;
}
export interface BracketData {
  resolved: boolean;                       // R32 teams populated yet?
  teams: Record<string, BracketTeam>;       // teamId -> display
  r32: Record<string, { homeTeamId: string | null; awayTeamId: string | null }>;
  matches: BracketMatchRow[];               // all 32 KO matches
  picks: Record<string, string>;            // matchId -> predicted winner teamId
  userId: string | null;
}

const KO_STAGES = ["r32", "r16", "qf", "sf", "final", "third"];

export async function getBracketData(): Promise<BracketData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: matchRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, stage, home_team_id, away_team_id, lock_at, status, winner_team_id")
      .in("stage", KO_STAGES),
    supabase.from("teams").select("id, name, flag"),
  ]);

  const teams: Record<string, BracketTeam> = {};
  for (const t of teamRows ?? []) teams[t.id] = { name: t.name, flag: t.flag };

  const matches: BracketMatchRow[] = (matchRows ?? []).map((m) => ({
    id: m.id, stage: m.stage, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
    lockAt: m.lock_at, status: m.status, winnerTeamId: m.winner_team_id,
  }));

  const r32: BracketData["r32"] = {};
  for (const m of matches) {
    if (m.stage === "r32") r32[m.id] = { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId };
  }
  const resolved = Object.keys(r32).length > 0 && Object.values(r32).every((t) => t.homeTeamId && t.awayTeamId);

  let picks: Record<string, string> = {};
  if (user) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, predicted_winner_team_id")
      .eq("user_id", user.id)
      .not("predicted_winner_team_id", "is", null);
    picks = Object.fromEntries((preds ?? []).map((p) => [p.match_id, p.predicted_winner_team_id as string]));
  }

  return { resolved, teams, r32, matches, picks, userId: user?.id ?? null };
}
```

- [ ] **Step 2: Type-check + commit**

```bash
cd /Users/vaamx/worldcup2026
npx tsc --noEmit
git add lib/bracket/queries.ts
git commit -m "feat(bracket): server query (KO matches + teams + picks + resolved gate)"
```

---

## Task 3: TieCard + bracket client (state, prune, autosave)

**Files:**
- Create: `components/bracket/TieCard.tsx`, `app/(app)/bracket/bracket-client.tsx`

- [ ] **Step 1: Write `components/bracket/TieCard.tsx`**

```tsx
"use client";

import type { BracketTeam } from "@/lib/bracket/queries";

function TeamRow({
  teamId, team, picked, dimmed, locked, onPick,
}: {
  teamId?: string;
  team?: BracketTeam;
  picked: boolean;
  dimmed: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const label = team?.name ?? (teamId ? teamId : "—");
  return (
    <button
      disabled={locked || !teamId}
      onClick={onPick}
      className={
        "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
        (picked
          ? "bg-[var(--bn-gold)]/15 border border-[var(--bn-gold)] font-extrabold text-white"
          : "border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]") +
        (dimmed ? " opacity-40" : "") +
        (locked || !teamId ? " cursor-default" : "")
      }
    >
      <span aria-hidden>{team?.flag ?? "•"}</span>
      <span className="truncate">{label}</span>
      {picked && <span className="ml-auto text-[var(--bn-gold)]">✓</span>}
    </button>
  );
}

export function TieCard({
  home, away, homeTeam, awayTeam, pick, locked, onPick,
}: {
  home?: string;
  away?: string;
  homeTeam?: BracketTeam;
  awayTeam?: BracketTeam;
  pick?: string;
  locked: boolean;
  onPick: (teamId: string) => void;
}) {
  const decided = pick !== undefined;
  return (
    <div className="space-y-1.5">
      <TeamRow teamId={home} team={homeTeam} picked={pick === home} dimmed={decided && pick !== home} locked={locked} onPick={() => home && onPick(home)} />
      <TeamRow teamId={away} team={awayTeam} picked={pick === away} dimmed={decided && pick !== away} locked={locked} onPick={() => away && onPick(away)} />
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/bracket/bracket-client.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildBracketView } from "@/lib/bracket/userBracket";
import { TieCard } from "@/components/bracket/TieCard";
import { RoundStepper } from "@/components/bracket/RoundStepper";
import type { BracketData } from "@/lib/bracket/queries";

const ROUNDS: Array<{ stage: BracketData["matches"][number]["stage"]; label: string; prefix: string; count: number }> = [
  { stage: "r32", label: "Round of 32", prefix: "R32", count: 16 },
  { stage: "r16", label: "Round of 16", prefix: "R16", count: 8 },
  { stage: "qf", label: "Quarterfinals", prefix: "QF", count: 4 },
  { stage: "sf", label: "Semifinals", prefix: "SF", count: 2 },
  { stage: "final", label: "Final", prefix: "F", count: 1 },
];

function lockedById(matches: BracketData["matches"]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of matches) {
    out[m.id] = m.status === "final" || m.status === "live" || (m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now());
  }
  return out;
}

export function BracketClient({ data }: { data: BracketData }) {
  const supabase = useMemo(() => createClient(), []);
  const [picks, setPicks] = useState<Record<string, string>>(data.picks);
  const [round, setRound] = useState(0);
  const [saving, setSaving] = useState(false);
  const locks = useMemo(() => lockedById(data.matches), [data.matches]);

  const { view, validPicks } = useMemo(() => buildBracketView(data.r32, picks), [data.r32, picks]);

  async function onPick(matchId: string, teamId: string) {
    if (!data.userId) return;
    const next = { ...validPicks, [matchId]: teamId };
    const { validPicks: pruned } = buildBracketView(data.r32, next);
    setPicks(pruned);

    setSaving(true);
    // Upsert the new pick; delete any picks the change invalidated.
    await supabase.from("predictions").upsert(
      { user_id: data.userId, match_id: matchId, predicted_winner_team_id: teamId },
      { onConflict: "user_id,match_id" }
    );
    const removed = Object.keys(validPicks).filter((id) => id !== matchId && !(id in pruned));
    if (removed.length > 0) {
      await supabase.from("predictions").delete().eq("user_id", data.userId).in("match_id", removed);
    }
    setSaving(false);
  }

  const r = ROUNDS[round];
  const matchIds = Array.from({ length: r.count }, (_, i) => `${r.prefix}-${i + 1}`);
  const champion = view["F-1"]?.pick;

  const completedRounds: Record<string, boolean> = {};
  for (const rr of ROUNDS) {
    const ids = Array.from({ length: rr.count }, (_, i) => `${rr.prefix}-${i + 1}`);
    completedRounds[rr.stage] = ids.every((id) => validPicks[id] !== undefined);
  }

  return (
    <div className="space-y-5">
      <RoundStepper rounds={ROUNDS.map((x) => ({ stage: x.stage, label: x.prefix === "F" ? "F" : x.prefix }))} active={round} completed={completedRounds} onSelect={setRound} />

      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">KNOCKOUT</p>
        <h1 className="text-2xl font-black">{r.label}</h1>
      </div>

      {r.stage === "final" && champion && (
        <div className="rounded-2xl border border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/10 p-4 text-center">
          <div className="text-3xl">🏆</div>
          <p className="mt-1 text-sm text-white/60">Your champion</p>
          <p className="text-xl font-black text-[var(--bn-gold)]">{data.teams[champion]?.name ?? champion}</p>
        </div>
      )}

      <div className="space-y-4">
        {matchIds.map((id) => {
          const v = view[id] ?? {};
          return (
            <TieCard
              key={id}
              home={v.homeTeamId}
              away={v.awayTeamId}
              homeTeam={v.homeTeamId ? data.teams[v.homeTeamId] : undefined}
              awayTeam={v.awayTeamId ? data.teams[v.awayTeamId] : undefined}
              pick={v.pick}
              locked={locks[id] ?? false}
              onPick={(teamId) => onPick(id, teamId)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button disabled={round === 0} onClick={() => setRound((x) => Math.max(0, x - 1))} className="text-sm font-semibold text-white/50 disabled:opacity-30">← Back</button>
        <span className="text-xs text-white/40">{saving ? "Saving…" : "Saved"}</span>
        <button disabled={round === ROUNDS.length - 1} onClick={() => setRound((x) => Math.min(ROUNDS.length - 1, x + 1))} className="text-sm font-semibold text-[var(--bn-gold)] disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build to verify**

Run: `cd /Users/vaamx/worldcup2026 && npm run build`
Expected: build fails ONLY on the missing `RoundStepper` import (created next) — or create RoundStepper first (Task 4 Step 1) then build. Proceed to Task 4.

- [ ] **Step 4: Commit (after RoundStepper exists — see Task 4)**

Defer this commit; commit TieCard + bracket-client together with the page in Task 4 to keep the build green per commit.

---

## Task 4: RoundStepper + bracket page + entry + gating

**Files:**
- Create: `components/bracket/RoundStepper.tsx`, `app/(app)/bracket/page.tsx`
- Modify: `app/(app)/leagues/page.tsx`

- [ ] **Step 1: Write `components/bracket/RoundStepper.tsx`**

```tsx
"use client";

export function RoundStepper({
  rounds, active, completed, onSelect,
}: {
  rounds: Array<{ stage: string; label: string }>;
  active: number;
  completed: Record<string, boolean>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {rounds.map((r, i) => {
        const isActive = i === active;
        const isDone = completed[r.stage];
        return (
          <button
            key={r.stage}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            className={
              "h-9 flex-1 rounded-lg text-xs font-extrabold transition-colors " +
              (isActive
                ? "bg-[var(--bn-gold)] text-[#0a1428]"
                : isDone
                ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)] border border-[var(--bn-success)]/40"
                : "bg-white/5 text-white/60 border border-white/10")
            }
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write `app/(app)/bracket/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getBracketData } from "@/lib/bracket/queries";
import { BracketClient } from "./bracket-client";

export default async function BracketPage() {
  const data = await getBracketData();
  if (!data.userId) redirect("/");

  if (!data.resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-3 text-2xl font-black">Bracket locked</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          Your knockout bracket unlocks once the group stage finishes and the Round of 32 is set. Keep predicting groups in the meantime.
        </p>
        <a href="/predict" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 font-black text-[#0a1428]">
          Predict groups →
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <BracketClient data={data} />
    </main>
  );
}
```

- [ ] **Step 3: Add a "Build your bracket" entry to `app/(app)/leagues/page.tsx`**

Directly after the existing "Make your group predictions" link block, add:
```tsx
      <a href="/bracket" className="block">
        <div className="rounded-2xl border border-[var(--bn-accent)]/30 bg-[var(--bn-accent)]/10 p-4 text-center font-extrabold text-[var(--bn-accent)]">
          🗺️ Build your knockout bracket →
        </div>
      </a>
```

- [ ] **Step 4: Build + type-check**

Run: `cd /Users/vaamx/worldcup2026 && npm run build && npx tsc --noEmit`
Expected: build succeeds; `/bracket` route present; 0 type errors.

- [ ] **Step 5: Commit (TieCard + client + stepper + page + entry)**

```bash
cd /Users/vaamx/worldcup2026
git add components/bracket "app/(app)/bracket" "app/(app)/leagues/page.tsx"
git commit -m "feat(bracket): interactive round-by-round bracket UI + gating + entry link"
```

---

## Task 5: Integration test + final verification

**Files:**
- Create: `lib/bracket/userBracket.itest.ts`

- [ ] **Step 1: Write `lib/bracket/userBracket.itest.ts`**

Proves a user can save a KO winner pick on a resolved, unlocked R32 match under RLS. Resolves the bracket first (simulate group results + resolveAndAdvance via the service-role admin), then acts as a real user.

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyResults, resolveAndAdvance } from "@/lib/scoring/run";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

describe("knockout pick saves under RLS (integration)", () => {
  let user: { id: string; client: SupabaseClient };
  let r32Match: { id: string; home_team_id: string };
  const stamp = `${process.pid}-${Math.floor(performance.now())}`;

  beforeAll(async () => {
    // Ensure groups are decided and R32 resolved.
    const { data: groupMatches } = await admin.from("matches").select("id").eq("stage", "group");
    await applyResults(admin, (groupMatches ?? []).map((m, i) => ({ matchId: m.id, homeScore: (i % 3) + 1, awayScore: i % 2 })));
    await resolveAndAdvance(admin);

    const { data: r32 } = await admin
      .from("matches").select("id, home_team_id, lock_at, status").eq("stage", "r32").limit(1).single();
    r32Match = { id: r32!.id, home_team_id: r32!.home_team_id as string };
    // Make sure it's unlocked for the test.
    await admin.from("matches").update({ lock_at: "2999-01-01T00:00:00Z", status: "scheduled" }).eq("id", r32Match.id);

    const email = `bracket-${stamp}@example.com`;
    const { data } = await admin.auth.admin.createUser({ email, password: "Password123!", email_confirm: true });
    const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    await client.auth.signInWithPassword({ email, password: "Password123!" });
    user = { id: data.user!.id, client };
  });

  it("saves a winner pick for a resolved, unlocked R32 tie", async () => {
    const { error } = await user.client.from("predictions").upsert(
      { user_id: user.id, match_id: r32Match.id, predicted_winner_team_id: r32Match.home_team_id },
      { onConflict: "user_id,match_id" }
    );
    expect(error).toBeNull();

    const { data } = await user.client
      .from("predictions").select("predicted_winner_team_id").eq("user_id", user.id).eq("match_id", r32Match.id).single();
    expect(data?.predicted_winner_team_id).toBe(r32Match.home_team_id);
  });
});
```

- [ ] **Step 2: Run integration**

Run: `cd /Users/vaamx/worldcup2026 && npm run seed && npm run test:integration`
Expected: all suites pass incl. the new bracket-pick test. (If `AuthRetryableFetchError`, `npx supabase stop && start`, health 200, retry.)

- [ ] **Step 3: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/bracket/userBracket.itest.ts
git commit -m "test(bracket): integration — KO winner pick saves under RLS"
```

- [ ] **Step 4: Final gates + runtime smoke**

Run:
```bash
cd /Users/vaamx/worldcup2026
npm test                  # unit: 63 prior + userBracket (~5) = ~68
npm run test:integration  # prior + bracket pick
npm run build             # success; /bracket present
npx tsc --noEmit          # 0 errors
# Runtime: bracket gates before resolution, renders after.
npm run seed              # R32 unresolved (fresh) -> /bracket shows locked state
npm run dev >/tmp/bk.log 2>&1 &
DEV=$!; for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:3000/ && break; sleep 1; done
JAR=$(mktemp); curl -s -c "$JAR" -b "$JAR" -o /dev/null http://localhost:3000/predict  # mint anon session
curl -s -c "$JAR" -b "$JAR" -o /tmp/bk.html -w "/bracket (unresolved): %{http_code}\n" http://localhost:3000/bracket
grep -oE "Bracket locked|Round of 32" /tmp/bk.html | sort -u
npm run simulate >/dev/null 2>&1   # finalize groups -> resolve R32
curl -s -c "$JAR" -b "$JAR" -o /tmp/bk2.html -w "/bracket (resolved): %{http_code}\n" http://localhost:3000/bracket
grep -oE "Bracket locked|Round of 32|KNOCKOUT" /tmp/bk2.html | sort -u
kill $DEV 2>/dev/null; rm -f "$JAR"
git status --short        # clean
```
Expected: gates green; unresolved → "Bracket locked"; after simulate → "Round of 32"/"KNOCKOUT" (fillable).

---

## Self-Review Notes (author)

- **Spec coverage:** full-bracket-upfront UI (pick winners forward to champion) → Tasks 3–4; real-qualifier R32 from the backend → consumed via `getBracketData`; pick propagation + invalid-pick pruning → Task 1 (`buildBracketView`); per-match-lock + resolved gating → Tasks 2–4; save under RLS → Task 3 + proven in Task 5.
- **Reuse:** `buildBracketView` reuses the `KNOCKOUT_MATCHES` feeds tree (same structure the backend advances actual results through) — the user-bracket propagation and the actual-bracket advancement share one source of truth. The round stepper mirrors the group `GroupStepper` pattern.
- **Correctness — prune cascade:** changing an upstream pick re-derives `validPicks`; downstream picks orphaned by the change are pruned from state AND deleted from the DB, so a user can't keep stale picks on teams no longer in their bracket. Tested in Task 1 and exercised in the client.
- **Deferred-by-design (NOT gaps):** ✓/✗ of picks vs actual results, the fancy full-tree SVG on large screens, KO scoreline predictions, and confetti/celebration on champion pick → Plan 7 polish.
- **Type/name consistency:** `BracketData`/`BracketMatchRow`/`BracketTeam` shared between `queries.ts`, the page, and the client; `buildBracketView(r32Teams, picks)` signature matches between Task 1, its test, and `bracket-client.tsx`; `RoundStepper` props match between Task 4 and its use in Task 3.
- **Auth:** sign-in optional — guests (anonymous session) have a `userId` and can fill/save their bracket exactly like signed-in users (RLS treats anon as authenticated, per Plan 2/optional-auth).
```
