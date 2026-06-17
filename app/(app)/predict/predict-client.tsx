"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GroupPredictor } from "@/components/predict/GroupPredictor";
import { GroupStepper } from "@/components/predict/GroupStepper";
import { Button } from "@/components/ui/Button";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";
import { useI18n } from "@/lib/i18n/provider";

const isPicked = (m: PredictMatch) => m.predictedHome !== null && m.predictedAway !== null;
// A match is "done" for progress when you've predicted it OR it's already been
// played (final) — you can't predict a finished match, so it must not block you.
const isResolved = (m: PredictMatch) => isPicked(m) || m.status === "final";

export function PredictClient({ groups: initial, userId }: { groups: PredictGroup[]; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const celebrate = useCelebration();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<PredictGroup[]>(initial);
  const labels = useMemo(() => initial.map((g) => g.label), [initial]);
  // Active group persists in the URL (?g=B) so a reload keeps you where you were.
  const [active, setActive] = useState(() => Math.max(0, labels.indexOf(searchParams.get("g") ?? "")));
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef(0);

  const selectGroup = useCallback((i: number) => {
    const clamped = Math.min(Math.max(0, i), labels.length - 1);
    setActive(clamped);
    const params = new URLSearchParams(searchParams.toString());
    params.set("g", labels[clamped]);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [labels, pathname, router, searchParams]);

  // Per-group progress, recomputed from live client state so it updates as you type.
  // A finished match counts as done (you can't predict it) so it never blocks completion.
  const progress = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const g of groups) {
      out[g.label] = { done: g.matches.filter(isResolved).length, total: g.matches.length };
    }
    return out;
  }, [groups]);

  const totalsByMatch = useMemo(() => {
    let done = 0, total = 0;
    for (const g of groups) for (const m of g.matches) { total++; if (isResolved(m)) done++; }
    return { done, total };
  }, [groups]);

  const groupsDone = Object.values(progress).filter((p) => p.total > 0 && p.done === p.total).length;

  function saveMatch(match: PredictMatch) {
    clearTimeout(timers.current[match.id]);
    timers.current[match.id] = setTimeout(async () => {
      if (match.predictedHome === null || match.predictedAway === null) return;
      pending.current += 1;
      setSaving(true);
      const { error } = await supabase.from("predictions").upsert(
        {
          user_id: userId,
          match_id: match.id,
          predicted_home: match.predictedHome,
          predicted_away: match.predictedAway,
        },
        { onConflict: "user_id,match_id" }
      );
      pending.current -= 1;
      if (error) {
        console.error("Failed to save prediction", match.id, error.message);
        setSaveFailed(true);
      } else {
        setSaveFailed(false);
      }
      if (pending.current === 0) setSaving(false);
    }, 600);
  }

  function handleScore(groupLabel: string, matchId: string, side: "home" | "away", value: number | null) {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.label !== groupLabel) return g;
        const wasComplete = g.matches.length > 0 && g.matches.every(isResolved);
        const matches = g.matches.map((m) =>
          m.id === matchId
            ? { ...m, predictedHome: side === "home" ? value : m.predictedHome, predictedAway: side === "away" ? value : m.predictedAway }
            : m
        );
        saveMatch(matches.find((m) => m.id === matchId)!);
        // Little reward when a group's predictable matches are all done.
        const nowComplete = matches.length > 0 && matches.every(isResolved);
        if (!wasComplete && nowComplete) celebrate("small");
        return { ...g, matches };
      })
    );
  }

  const group = groups[active];
  const gp = progress[group.label] ?? { done: 0, total: 0 };

  return (
    <div className="space-y-5">
      {/* Overall progress */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold tracking-[2px] text-[var(--bn-accent)]">{t.predict.groupStage}</span>
          <span className="font-bold text-white/60">{t.predict.groupsComplete(groupsDone, groups.length)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--bn-gold)] to-[var(--bn-gold-bright)]"
            initial={false}
            animate={{ width: `${totalsByMatch.total ? (totalsByMatch.done / totalsByMatch.total) * 100 : 0}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">{t.predict.matchesPredicted(totalsByMatch.done, totalsByMatch.total)}</p>
      </div>

      {groupsDone === groups.length && (
        <Link href="/bracket" className="block">
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--bn-gold)]/50 bg-gradient-to-r from-[var(--bn-gold)]/20 to-transparent p-4">
            <span className="text-2xl" aria-hidden>🏆</span>
            <div className="min-w-0 flex-1">
              <p className="font-black">{t.predict.allSet}</p>
              <p className="text-xs text-white/60">{t.predict.allSetSub}</p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-[var(--bn-gold)]">{t.predict.bracketCta}</span>
          </div>
        </Link>
      )}

      <GroupStepper labels={labels} active={active} progress={progress} onSelect={selectGroup} />

      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black">{t.predict.group(group.label)}</h1>
        <span className="pb-1 text-xs font-bold text-white/45">{t.predict.predicted(gp.done, gp.total)}</span>
      </div>

      <GroupPredictor
        group={group}
        saving={saving}
        saveFailed={saveFailed}
        onScore={(matchId, side, value) => handleScore(group.label, matchId, side, value)}
      />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" disabled={active === 0} onClick={() => selectGroup(active - 1)}>
          ← {t.predict.group(labels[Math.max(0, active - 1)])}
        </Button>
        <Button disabled={active === labels.length - 1} onClick={() => selectGroup(active + 1)}>
          {t.predict.group(labels[Math.min(labels.length - 1, active + 1)])} →
        </Button>
      </div>
    </div>
  );
}
