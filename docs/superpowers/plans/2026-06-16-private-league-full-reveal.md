# Private League Full Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In private leagues (is_global=false), reveal ALL teammate match predictions (not just locked ones) and show their Top-Scorer picks; keep global league behavior unchanged.

**Architecture:** Extend `getMemberPredictions` in `lib/leagues/memberPredictions.ts` to (1) detect league privacy, (2) skip the lock gate for private leagues, (3) fetch scorer_predictions + players + team flags for private leagues and return them in a new `scorerPicks` field. Update the i18n dictionaries and render the scorer pills in the member page.

**Tech Stack:** Next.js 16 App Router, Supabase service-role admin client, TypeScript, Tailwind CSS, bilingual i18n (en/es)

---

## File Map

| File | Change |
|---|---|
| `lib/leagues/memberPredictions.ts` | Add `scorerPicks` to `MemberPredView`, detect `isPrivate`, skip lock gate for private, fetch scorer data |
| `lib/i18n/dictionaries/en.ts` | Add `scorerPicksTitle`, `goldenBootTag` to `leagues` section |
| `lib/i18n/dictionaries/es.ts` | Add `scorerPicksTitle`, `goldenBootTag` to `leagues` section |
| `app/(app)/leagues/[id]/u/[userId]/page.tsx` | Render scorer picks pills when `view.scorerPicks.length > 0` |

---

### Task 1: Extend MemberPredView + full-reveal logic in memberPredictions.ts

**Files:**
- Modify: `lib/leagues/memberPredictions.ts`

- [ ] **Step 1: Open the file and understand current structure**

Current `MemberPredView` (lines 20-24):
```ts
export interface MemberPredView {
  displayName: string | null;
  locked: MemberPredItem[];
  hiddenCount: number;
}
```
Current reveal gate (line 65): `if (!isLocked(m, now)) { hiddenCount++; continue; }`

- [ ] **Step 2: Update the file with all changes**

Replace the entire file content with:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { outcomeOf } from "@/lib/math";

export interface MemberPredItem {
  matchId: string;
  stage: string;
  groupLabel: string | null;
  kickoffAt: string | null;
  home: { id: string; name: string; flag: string | null } | null;
  away: { id: string; name: string; flag: string | null } | null;
  predHome: number | null;
  predAway: number | null;
  predWinnerId: string | null;
  final: boolean;
  homeScore: number | null;
  awayScore: number | null;
  verdict: "exact" | "result" | "miss" | null;
}

export interface MemberPredView {
  displayName: string | null;
  locked: MemberPredItem[];   // matches that are revealed (locked, or all if private)
  hiddenCount: number;        // upcoming matches hidden (0 for private leagues)
  scorerPicks: { playerId: string; name: string; flag: string | null; teamId: string | null; isBoot: boolean }[];
}

function isLocked(m: { status: string; lock_at: string | null }, now: number): boolean {
  return m.status === "final" || m.status === "live" || (m.lock_at !== null && new Date(m.lock_at).getTime() <= now);
}

/**
 * A league co-member's predictions.
 * - Global league: reveals ONLY locked matches (kicked off / final), no scorer picks — fair play.
 * - Private league (is_global=false): reveals ALL predicted matches regardless of lock,
 *   AND shows the teammate's Top-Scorer picks (Golden Boot first).
 * Reads via the service-role client (predictions are owner-only under RLS) after
 * verifying both the viewer and target belong to the league. null = not allowed.
 */
export async function getMemberPredictions(
  leagueId: string, targetUserId: string, viewerId: string
): Promise<MemberPredView | null> {
  let admin;
  try { admin = createAdminClient(); } catch { return null; }

  const { data: members } = await admin
    .from("league_members").select("user_id").eq("league_id", leagueId).in("user_id", [viewerId, targetUserId]);
  const ids = new Set((members ?? []).map((m) => m.user_id));
  if (!ids.has(viewerId) || !ids.has(targetUserId)) return null; // both must be members

  // Determine if this is a private league
  const { data: league } = await admin.from("leagues").select("is_global").eq("id", leagueId).maybeSingle();
  const isPrivate = league ? !league.is_global : false;

  const [{ data: profile }, { data: matches }, { data: teams }, { data: preds }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", targetUserId).maybeSingle(),
    admin.from("matches").select("id, stage, group_label, home_team_id, away_team_id, kickoff_at, lock_at, status, home_score, away_score, winner_team_id"),
    admin.from("teams").select("id, name, flag"),
    admin.from("predictions").select("match_id, predicted_home, predicted_away, predicted_winner_team_id").eq("user_id", targetUserId),
  ]);

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const predByMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));
  const now = Date.now();

  const locked: MemberPredItem[] = [];
  let hiddenCount = 0;

  for (const m of matches ?? []) {
    const p = predByMatch.get(m.id);
    const hasPred = p && (p.predicted_home !== null || p.predicted_away !== null || p.predicted_winner_team_id !== null);
    if (!hasPred) continue;

    // In private leagues reveal everything; in global leagues only reveal locked matches
    const revealed = isPrivate || isLocked(m, now);
    if (!revealed) { hiddenCount++; continue; }

    const final = m.status === "final" && m.home_score !== null && m.away_score !== null;
    let verdict: MemberPredItem["verdict"] = null;
    if (final && p!.predicted_home !== null && p!.predicted_away !== null) {
      const exact = p!.predicted_home === m.home_score && p!.predicted_away === m.away_score;
      const sameOutcome = outcomeOf(p!.predicted_home, p!.predicted_away) === outcomeOf(m.home_score as number, m.away_score as number);
      verdict = exact ? "exact" : sameOutcome ? "result" : "miss";
    }
    const team = (id: string | null) => {
      if (!id) return null;
      const tt = teamById.get(id);
      return tt ? { id, name: tt.name, flag: tt.flag } : { id, name: id, flag: null };
    };
    locked.push({
      matchId: m.id, stage: m.stage, groupLabel: m.group_label, kickoffAt: m.kickoff_at,
      home: team(m.home_team_id), away: team(m.away_team_id),
      predHome: p!.predicted_home, predAway: p!.predicted_away, predWinnerId: p!.predicted_winner_team_id,
      final, homeScore: m.home_score, awayScore: m.away_score, verdict,
    });
  }

  locked.sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""));

  // Fetch scorer picks only for private leagues
  let scorerPicks: MemberPredView["scorerPicks"] = [];
  if (isPrivate) {
    const { data: scorerPreds } = await admin
      .from("scorer_predictions")
      .select("player_id, is_golden_boot")
      .eq("user_id", targetUserId);

    if (scorerPreds && scorerPreds.length > 0) {
      const playerIds = scorerPreds.map((sp) => sp.player_id);
      const { data: players } = await admin
        .from("players")
        .select("id, name, team_id")
        .in("id", playerIds);

      // Build team->flag map for the players' teams (reuse teamById already loaded above)
      const playerMap = new Map((players ?? []).map((pl) => [pl.id, pl]));

      scorerPicks = scorerPreds
        .map((sp) => {
          const pl = playerMap.get(sp.player_id);
          if (!pl) return null;
          const teamEntry = pl.team_id ? teamById.get(pl.team_id) : null;
          return {
            playerId: sp.player_id,
            name: pl.name,
            flag: teamEntry?.flag ?? null,
            teamId: pl.team_id ?? null,
            isBoot: sp.is_golden_boot,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        // Golden Boot first, then alphabetical
        .sort((a, b) => (b.isBoot ? 1 : 0) - (a.isBoot ? 1 : 0) || a.name.localeCompare(b.name));
    }
  }

  return { displayName: profile?.display_name ?? null, locked, hiddenCount, scorerPicks };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -30`
Expected: no errors about memberPredictions.ts

---

### Task 2: Add i18n keys to en.ts and es.ts

**Files:**
- Modify: `lib/i18n/dictionaries/en.ts` (leagues section, after `ftShort`)
- Modify: `lib/i18n/dictionaries/es.ts` (leagues section, after `ftShort`)

- [ ] **Step 1: Add to en.ts leagues section**

After `ftShort: "FT",` add:
```ts
    scorerPicksTitle: "Their Top Scorers",
    goldenBootTag: "Golden Boot",
```

- [ ] **Step 2: Add to es.ts leagues section**

After `ftShort: "FINAL",` add:
```ts
    scorerPicksTitle: "Sus goleadores",
    goldenBootTag: "Bota de Oro",
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1 | head -30`
Expected: no errors

---

### Task 3: Render scorer picks in member page

**Files:**
- Modify: `app/(app)/leagues/[id]/u/[userId]/page.tsx`

- [ ] **Step 1: Add scorer picks section to the JSX**

After the hidden count paragraph (line 87 area, `{view.hiddenCount > 0 && ...}`), add:

```tsx
{view.scorerPicks.length > 0 && (
  <div>
    <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.leagues.scorerPicksTitle}</p>
    <div className="flex flex-wrap gap-2">
      {view.scorerPicks.map((s) => (
        <span key={s.playerId} className={"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold " + (s.isBoot ? "border-[var(--bn-gold)] text-[var(--bn-gold)]" : "border-white/12 text-white/80")}>
          {s.isBoot && <span aria-hidden>🥇</span>}<span aria-hidden>{s.flag ?? "🏳️"}</span>{s.name}
        </span>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 2: Verify TypeScript compiles clean**

Run: `cd /Users/vaamx/worldcup2026 && npx tsc --noEmit 2>&1`
Expected: zero errors

- [ ] **Step 3: Verify build compiles**

Run: `cd /Users/vaamx/worldcup2026 && npm run build 2>&1 | tail -20`
Expected: successful build, no type errors

---

### Task 4: Run tests + commit

- [ ] **Step 1: Run tests**

Run: `cd /Users/vaamx/worldcup2026 && npx vitest run 2>&1 | tail -30`
Expected: all pass (or no test files found — acceptable if no unit tests exist for this module)

- [ ] **Step 2: Commit**

```bash
cd /Users/vaamx/worldcup2026
git add lib/leagues/memberPredictions.ts lib/i18n/dictionaries/en.ts lib/i18n/dictionaries/es.ts "app/(app)/leagues/[id]/u/[userId]/page.tsx"
git commit -m "feat(leagues): full-reveal teammate picks + scorers in private leagues"
```
