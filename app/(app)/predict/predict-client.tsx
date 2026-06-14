"use client";

import { useMemo, useState } from "react";
import { GroupPredictor } from "@/components/predict/GroupPredictor";
import { GroupStepper } from "@/components/predict/GroupStepper";
import { Button } from "@/components/ui/Button";
import type { PredictGroup } from "@/lib/predictions/types";

export function PredictClient({ groups, userId }: { groups: PredictGroup[]; userId: string }) {
  const [active, setActive] = useState(0);
  const labels = groups.map((g) => g.label);

  // A group is "complete" when all its matches have both scores filled.
  const completed = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const g of groups) {
      out[g.label] = g.matches.length > 0 && g.matches.every((m) => m.predictedHome !== null && m.predictedAway !== null);
    }
    return out;
  }, [groups]);

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

      <GroupPredictor key={group.label} group={group} userId={userId} />

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
