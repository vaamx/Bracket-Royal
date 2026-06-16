"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { GroupPredictor } from "@/components/predict/GroupPredictor";
import { GroupStepper } from "@/components/predict/GroupStepper";
import { Button } from "@/components/ui/Button";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";

const isPicked = (m: PredictMatch) => m.predictedHome !== null && m.predictedAway !== null;

export function PredictClient({ groups: initial, userId }: { groups: PredictGroup[]; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const celebrate = useCelebration();
  const [groups, setGroups] = useState<PredictGroup[]>(initial);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef(0);

  const labels = groups.map((g) => g.label);

  // Per-group progress, recomputed from live client state so it updates as you type.
  const progress = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const g of groups) {
      out[g.label] = { done: g.matches.filter(isPicked).length, total: g.matches.length };
    }
    return out;
  }, [groups]);

  const totalsByMatch = useMemo(() => {
    let done = 0, total = 0;
    for (const g of groups) for (const m of g.matches) { total++; if (isPicked(m)) done++; }
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
        const wasComplete = g.matches.length > 0 && g.matches.every(isPicked);
        const matches = g.matches.map((m) =>
          m.id === matchId
            ? { ...m, predictedHome: side === "home" ? value : m.predictedHome, predictedAway: side === "away" ? value : m.predictedAway }
            : m
        );
        saveMatch(matches.find((m) => m.id === matchId)!);
        // Little reward when a group's 6 matches all get picked.
        const nowComplete = matches.length > 0 && matches.every(isPicked);
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
          <span className="font-bold tracking-[2px] text-[var(--bn-accent)]">GROUP STAGE</span>
          <span className="font-bold text-white/60">{groupsDone}/{groups.length} groups complete</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--bn-gold)] to-[var(--bn-gold-bright)]"
            initial={false}
            animate={{ width: `${totalsByMatch.total ? (totalsByMatch.done / totalsByMatch.total) * 100 : 0}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">{totalsByMatch.done} of {totalsByMatch.total} matches predicted</p>
      </div>

      <GroupStepper labels={labels} active={active} progress={progress} onSelect={setActive} />

      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black">Group {group.label}</h1>
        <span className="pb-1 text-xs font-bold text-white/45">{gp.done}/{gp.total} predicted</span>
      </div>

      <GroupPredictor
        group={group}
        saving={saving}
        saveFailed={saveFailed}
        onScore={(matchId, side, value) => handleScore(group.label, matchId, side, value)}
      />

      <div className="flex justify-between pt-2">
        <Button variant="ghost" disabled={active === 0} onClick={() => setActive((a) => Math.max(0, a - 1))}>
          ← Group {labels[Math.max(0, active - 1)]}
        </Button>
        <Button disabled={active === labels.length - 1} onClick={() => setActive((a) => Math.min(labels.length - 1, a + 1))}>
          Group {labels[Math.min(labels.length - 1, active + 1)]} →
        </Button>
      </div>
    </div>
  );
}
