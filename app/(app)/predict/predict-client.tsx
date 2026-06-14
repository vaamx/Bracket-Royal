"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GroupPredictor } from "@/components/predict/GroupPredictor";
import { GroupStepper } from "@/components/predict/GroupStepper";
import { Button } from "@/components/ui/Button";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";

export function PredictClient({ groups: initial, userId }: { groups: PredictGroup[]; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState<PredictGroup[]>(initial);
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef(0);

  const labels = groups.map((g) => g.label);

  // Recomputed from the live (client) group state, so progress updates as you type.
  const completed = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const g of groups) {
      out[g.label] = g.matches.length > 0 && g.matches.every((m) => m.predictedHome !== null && m.predictedAway !== null);
    }
    return out;
  }, [groups]);

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
        const matches = g.matches.map((m) =>
          m.id === matchId
            ? { ...m, predictedHome: side === "home" ? value : m.predictedHome, predictedAway: side === "away" ? value : m.predictedAway }
            : m
        );
        saveMatch(matches.find((m) => m.id === matchId)!);
        return { ...g, matches };
      })
    );
  }

  const group = groups[active];
  const doneCount = Object.values(completed).filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">GROUP STAGE</p>
          <h1 className="text-2xl font-black">Group {group.label}</h1>
        </div>
        <span className="text-xs text-white/50">{doneCount}/{groups.length} groups done</span>
      </div>

      <GroupStepper labels={labels} active={active} completed={completed} onSelect={setActive} />

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
