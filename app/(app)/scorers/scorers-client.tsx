"use client";
import { useMemo, useState, useTransition } from "react";
import { addScorerPick, removeScorerPick, setGoldenBoot, setBootGoals } from "@/lib/players/actions";
import { PlayerSearch } from "@/components/scorers/PlayerSearch";
import { PickRow } from "@/components/scorers/PickRow";
import { useI18n } from "@/lib/i18n/provider";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import type { PlayerLite } from "@/lib/players/queries";

export function ScorersClient({ contenders, initialPicks, initialBootId, initialBootGoals, locked }: {
  contenders: PlayerLite[]; initialPicks: PlayerLite[]; initialBootId: string | null; initialBootGoals: number | null; locked: boolean;
}) {
  const { t } = useI18n();
  const celebrate = useCelebration();
  const [picks, setPicks] = useState<PlayerLite[]>(initialPicks);
  const [bootId, setBootId] = useState<string | null>(initialBootId);
  const [bootGoals, setBootGoalsState] = useState<number | null>(initialBootGoals);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const chosenIds = useMemo(() => new Set(picks.map((p) => p.id)), [picks]);

  function add(id: string) {
    if (picks.length >= 10) { setErr(t.scorers.errMax); return; }
    const p = contenders.find((c) => c.id === id);
    const prev = picks;
    const next = [...picks, p ?? { id, name: id, teamId: null, flag: null, goals: 0, scorerRank: null }];
    setPicks(next); setErr(null);
    start(async () => {
      const r = await addScorerPick(id);
      if ("error" in r) { setErr(r.error === "max" ? t.scorers.errMax : r.error === "locked" ? t.scorers.errLocked : t.scorers.errGeneric); setPicks(prev); }
      else if (next.length === 10 && bootId) celebrate("small");
    });
  }
  function remove(id: string) { const next = picks.filter((p) => p.id !== id); setPicks(next); if (bootId === id) setBootId(null); start(async () => { await removeScorerPick(id); }); }
  function makeBoot(id: string) { setBootId(id); start(async () => { const r = await setGoldenBoot(id); if (!("error" in r) && picks.length === 10) celebrate("small"); }); }
  function goals(v: number | null) { setBootGoalsState(v); start(async () => { await setBootGoals(v); }); }

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-white/55">{t.scorers.progress(picks.length)}</p>
      <div className="space-y-2">
        {picks.map((p) => (
          <PickRow key={p.id} player={p} isBoot={bootId === p.id} predictedGoals={bootGoals} locked={locked}
            onSetBoot={() => makeBoot(p.id)} onRemove={() => remove(p.id)} onGoals={goals} />
        ))}
      </div>
      {!locked && picks.length < 10 && <PlayerSearch contenders={contenders} chosenIds={chosenIds} onAdd={add} />}
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
