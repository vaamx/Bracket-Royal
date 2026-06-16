# Player Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tappable player profile page at `/players/[id]` that shows stats and whether the player is in the user's Top 10 picks, and link to it from the scorers board.

**Architecture:** Four sequential tasks, each committed independently: (1) data query, (2) i18n strings, (3) profile page, (4) link existing scorer rows. The profile page is a server component using App Router dynamic segments. No new client components are needed.

**Tech Stack:** Next.js 16 App Router (server components), Supabase SSR client, TypeScript, Tailwind v4, bilingual via `getT()` / `useI18n()`.

---

### Task 1: getPlayerProfile query

**Files:**
- Modify: `lib/players/queries.ts`

- [ ] **Step 1: Read the current file**

Read `/Users/vaamx/worldcup2026/lib/players/queries.ts` — already read above; the file currently exports `PlayerLite`, `withFlags`, `searchPlayers`, `getContenders`, `getMyScorerBoard`, `getActualTop10`, `scorersLocked`. We add below `scorersLocked`.

- [ ] **Step 2: Add `PlayerProfile` interface and `getPlayerProfile` function**

Append to the END of `lib/players/queries.ts`:

```ts
export interface PlayerProfile {
  id: string; name: string; teamId: string | null; teamName: string | null; flag: string | null;
  position: string | null; goals: number; scorerRank: number | null;
  inMyTop10: boolean; isMyGoldenBoot: boolean;
}

export async function getPlayerProfile(id: string): Promise<PlayerProfile | null> {
  const supabase = await createClient();
  const { data: p } = await supabase.from("players").select("id, name, team_id, position, goals, scorer_rank").eq("id", id).maybeSingle();
  if (!p) return null;
  let teamName: string | null = null, flag: string | null = null;
  if (p.team_id) {
    const { data: team } = await supabase.from("teams").select("name, flag").eq("id", p.team_id).maybeSingle();
    teamName = team?.name ?? null; flag = team?.flag ?? null;
  }
  let inMyTop10 = false, isMyGoldenBoot = false;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: pick } = await supabase.from("scorer_predictions").select("is_golden_boot").eq("user_id", user.id).eq("player_id", id).maybeSingle();
    if (pick) { inMyTop10 = true; isMyGoldenBoot = pick.is_golden_boot; }
  }
  return { id: p.id, name: p.name, teamId: p.team_id, teamName, flag, position: p.position, goals: p.goals, scorerRank: p.scorer_rank, inMyTop10, isMyGoldenBoot };
}
```

- [ ] **Step 3: Run tsc check**

```bash
cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026 && git add lib/players/queries.ts && git commit -m "feat(players): getPlayerProfile query"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts`
- Modify: `lib/i18n/dictionaries/es.ts`

- [ ] **Step 1: Add `player` section to en.ts**

In `lib/i18n/dictionaries/en.ts`, place the new `player` key after the `scorers` section (before the `meta` key), so after line 258 (`},`):

```ts
  player: {
    eyebrow: "PLAYER",
    position: "Position",
    wcGoals: "World Cup goals",
    rank: (n: number) => `#${n} scorer`,
    unranked: "No goals yet",
    onYourTop10: "On your Top 10",
    yourGoldenBoot: "Your Golden Boot 🥇",
    notFound: "Player not found",
    back: "Back",
  },
```

- [ ] **Step 2: Add `player` section to es.ts**

In `lib/i18n/dictionaries/es.ts`, place the new `player` key after the `scorers` section (before the `meta` key), so after line 260 (`},`):

```ts
  player: {
    eyebrow: "JUGADOR",
    position: "Posición",
    wcGoals: "Goles en el Mundial",
    rank: (n: number) => `#${n} goleador`,
    unranked: "Aún sin goles",
    onYourTop10: "En tu Top 10",
    yourGoldenBoot: "Tu Bota de Oro 🥇",
    notFound: "Jugador no encontrado",
    back: "Atrás",
  },
```

Note: `es.ts` imports `type Dictionary` from `./en`, so TypeScript will error if any key is missing or mistyped in es.ts.

- [ ] **Step 3: Run tsc check**

```bash
cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026 && git add lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/es.ts && git commit -m "feat(i18n): player profile strings"
```

---

### Task 3: profile page

**Files:**
- Create: `app/(app)/players/[id]/page.tsx`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/vaamx/worldcup2026/app/\(app\)/players/\[id\]
```

- [ ] **Step 2: Create `app/(app)/players/[id]/page.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayerProfile } from "@/lib/players/queries";
import { getT } from "@/lib/i18n";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const p = await getPlayerProfile(id);
  if (!p) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🤷</div>
        <h1 className="mt-3 text-2xl font-black">{t.player.notFound}</h1>
        <Link href="/scorers" className="mt-4 text-sm font-semibold text-white/50 hover:text-white/80">← {t.player.back}</Link>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md space-y-5 p-6 pb-24">
      <Link href="/scorers" className="inline-block text-sm text-white/50 hover:text-white/80">← {t.player.back}</Link>
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[var(--bn-gold)]/10 to-transparent p-6 text-center">
        <div className="text-6xl">{p.flag ?? "🏳️"}</div>
        <p className="mt-2 text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.player.eyebrow}</p>
        <h1 className="text-2xl font-black">{p.name}</h1>
        <p className="text-sm text-white/55">{p.teamName ?? p.teamId}{p.position ? ` · ${p.position}` : ""}</p>
        {(p.inMyTop10 || p.isMyGoldenBoot) && (
          <p className="mt-2 inline-block rounded-full bg-[var(--bn-gold)]/15 px-3 py-1 text-xs font-bold text-[var(--bn-gold)]">
            {p.isMyGoldenBoot ? t.player.yourGoldenBoot : t.player.onYourTop10}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-[var(--bn-gold)]">{p.goals}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t.player.wcGoals}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-white">{p.scorerRank ? `#${p.scorerRank}` : "—"}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">{p.scorerRank ? t.player.rank(p.scorerRank) : t.player.unranked}</p>
        </div>
      </div>
    </main>
  );
}
```

Note: `notFound` is imported but we use an early return with the not-found UI instead of calling `notFound()` — that's intentional per spec. Remove the unused `notFound` import if tsc complains, or just leave the import for potential future use. Actually per spec the import IS there but we use the early return pattern. If tsc gives "declared but never read", remove the `notFound` import.

- [ ] **Step 3: Run tsc check**

```bash
cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output. If `notFound` is flagged as unused, remove it from the import line.

- [ ] **Step 4: Commit**

```bash
cd /Users/vaamx/worldcup2026 && git add "app/(app)/players/[id]/page.tsx" && git commit -m "feat(players): tournament-card profile page /players/[id]"
```

---

### Task 4: make players tappable

**Files:**
- Modify: `components/scorers/ActualTop10.tsx`
- Modify: `components/scorers/PickRow.tsx`

- [ ] **Step 1: Update ActualTop10.tsx**

The current file (`components/scorers/ActualTop10.tsx`) renders each row as:
```tsx
<span className="flex items-center gap-3"><span ...>{i+1}</span><span aria-hidden>{p.flag}</span><span>{p.name}</span></span>
```

Add `import Link from "next/link";` at the top, then wrap the left content span (flag + name, not the rank number) in a Link. New file content:

```tsx
import Link from "next/link";
import type { PlayerLite } from "@/lib/players/queries";
import type { Dictionary } from "@/lib/i18n";

export function ActualTop10({ rows, t }: { rows: PlayerLite[]; t: Dictionary }) {
  if (rows.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/50">{t.scorers.noActualYet}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((p, i) => (
        <li key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <span className="flex items-center gap-3">
            <span className="w-5 text-center font-extrabold text-[var(--bn-gold)]">{i + 1}</span>
            <Link href={`/players/${p.id}`} className="flex items-center gap-2 hover:opacity-80">
              <span aria-hidden>{p.flag ?? "🏳️"}</span>
              <span className="text-sm font-semibold">{p.name}</span>
            </Link>
          </span>
          <span className="text-sm font-black tabular-nums text-[var(--bn-gold)]">{p.goals}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Update PickRow.tsx**

The current player name line is:
```tsx
<span className="min-w-0 flex-1 truncate text-sm font-semibold">{player.name} <span className="text-white/40">{player.teamId}</span></span>
```

Add `import Link from "next/link";` after the existing imports, then wrap just `player.name` in a Link. Keep the `teamId` span outside the link. Keep all buttons as siblings (no nesting buttons inside the link).

New file content:

```tsx
"use client";
import Link from "next/link";
import type { PlayerLite } from "@/lib/players/queries";
import { useI18n } from "@/lib/i18n/provider";

export function PickRow({
  player, isBoot, predictedGoals, locked, actualGoals, inTop10, onSetBoot, onRemove, onGoals,
}: {
  player: PlayerLite; isBoot: boolean; predictedGoals: number | null; locked: boolean;
  actualGoals?: number; inTop10?: boolean;
  onSetBoot: () => void; onRemove: () => void; onGoals: (v: number | null) => void;
}) {
  const { t } = useI18n();
  return (
    <div className={"rounded-2xl border px-3 py-2.5 " + (isBoot ? "border-[var(--bn-gold)] bg-[var(--bn-gold)]/[0.06]" : "border-white/10 bg-white/[0.02]")}>
      <div className="flex items-center gap-2">
        <button onClick={onSetBoot} disabled={locked} aria-label={t.scorers.setBoot} className={"text-lg " + (isBoot ? "" : "opacity-30 hover:opacity-70")}>{isBoot ? "🥇" : "☆"}</button>
        <span className="text-lg" aria-hidden>{player.flag ?? "🏳️"}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Link href={`/players/${player.id}`} className="hover:underline">{player.name}</Link>
          {" "}<span className="text-white/40">{player.teamId}</span>
        </span>
        {actualGoals != null && <span className="text-xs text-white/55">{t.scorers.goals(actualGoals)}{inTop10 ? " ✓" : ""}</span>}
        {!locked && <button onClick={onRemove} aria-label={t.scorers.remove} className="text-xs font-bold text-red-400/80">✕</button>}
      </div>
      {isBoot && (
        <div className="mt-2 flex items-center gap-2 pl-7">
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/40">{t.scorers.predictedGoals}</span>
          <input type="number" inputMode="numeric" min={0} max={30} disabled={locked} defaultValue={predictedGoals ?? ""}
            onChange={(e) => onGoals(e.target.value === "" ? null : Math.max(0, Math.min(30, Math.floor(Number(e.target.value)))))}
            className="h-9 w-14 rounded-lg border border-white/15 bg-black/30 text-center text-sm font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none focus:border-[var(--bn-gold)]" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tsc check**

```bash
cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -40
```
Expected: no output.

- [ ] **Step 4: Run full build**

```bash
cd /Users/vaamx/worldcup2026 && npm run build 2>&1 | tail -30
```
Expected: build succeeds, `/players/[id]` route visible in route list.

- [ ] **Step 5: Run vitest**

```bash
cd /Users/vaamx/worldcup2026 && npx vitest run 2>&1 | tail -20
```
Expected: all pass (or no test files found — that's fine).

- [ ] **Step 6: Commit**

```bash
cd /Users/vaamx/worldcup2026 && git add components/scorers/ActualTop10.tsx components/scorers/PickRow.tsx && git commit -m "feat(players): link board + picks to profiles"
```

---

## Self-Review

**Spec coverage:**
- Task 1 ✓ — `getPlayerProfile` with full spec body
- Task 2 ✓ — both dictionaries updated with identical key set
- Task 3 ✓ — `/players/[id]/page.tsx` with all UI per spec
- Task 4 ✓ — ActualTop10 and PickRow both updated with Links

**Placeholder scan:** None found — all steps contain complete code.

**Type consistency:**
- `PlayerProfile` defined in Task 1, consumed in Task 3 — field names match (`p.flag`, `p.name`, `p.goals`, `p.scorerRank`, `p.inMyTop10`, `p.isMyGoldenBoot`, `p.teamName`, `p.teamId`, `p.position`)
- `t.player.*` keys defined in Task 2, consumed in Task 3 — all key names match
- `t.player.rank` is a function `(n: number) => string`; in Task 3 called as `t.player.rank(p.scorerRank)` — correct
- `Link` from `next/link` added in both Task 4 files

**One cleanup note:** The spec shows `import { notFound } from "next/navigation";` in Task 3 but then uses an early return pattern rather than calling `notFound()`. TypeScript strict mode may flag this as unused. The plan notes to remove it if tsc complains. The safer approach: omit `notFound` from the import in Task 3, since it isn't called.
