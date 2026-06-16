"use client";
import { useMemo, useState, useTransition } from "react";
import { addScorerPick, removeScorerPick, setGoldenBoot, setPickGoals } from "@/lib/players/actions";
import { PlayerSearch } from "@/components/scorers/PlayerSearch";
import { PickRow } from "@/components/scorers/PickRow";
import { useI18n } from "@/lib/i18n/provider";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import type { PlayerLite } from "@/lib/players/queries";

export function ScorersClient({ contenders, initialPicks, initialBootId, initialGoals, locked }: {
  contenders: PlayerLite[]; initialPicks: PlayerLite[]; initialBootId: string | null; initialGoals: Record<string, number | null>; locked: boolean;
}) {
  const { t } = useI18n();
  const celebrate = useCelebration();
  const [picks, setPicks] = useState<PlayerLite[]>(initialPicks);
  const [bootId, setBootId] = useState<string | null>(initialBootId);
  const [goalsByPlayer, setGoalsByPlayer] = useState<Record<string, number | null>>(initialGoals);
  const [err, setErr] = useState<string | null>(null);
  const [, start] = useTransition();
  const chosenIds = useMemo(() => new Set(picks.map((p) => p.id)), [picks]);
  const goalsSet = useMemo(() => picks.filter((p) => goalsByPlayer[p.id] != null).length, [picks, goalsByPlayer]);

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
  function remove(id: string) {
    const next = picks.filter((p) => p.id !== id);
    setPicks(next);
    if (bootId === id) setBootId(null);
    setGoalsByPlayer((g) => { const { [id]: _, ...rest } = g; return rest; });
    start(async () => { await removeScorerPick(id); });
  }
  function makeBoot(id: string) { setBootId(id); start(async () => { const r = await setGoldenBoot(id); if (!("error" in r) && picks.length === 10) celebrate("small"); }); }
  function goals(id: string, v: number | null) {
    setGoalsByPlayer((g) => ({ ...g, [id]: v }));
    start(async () => { await setPickGoals(id, v); });
  }

  const bootName = bootId ? picks.find((p) => p.id === bootId)?.name ?? null : null;

  return (
    <div className="space-y-4">
      {/* Progress + Golden Boot status */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold tracking-[2px] text-[var(--bn-accent)]">{t.scorers.yourTop10}</span>
          <span className="font-bold text-white/60">{t.scorers.progress(picks.length)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--bn-gold)] to-[var(--bn-gold-bright)] transition-[width] duration-300"
            style={{ width: `${picks.length * 10}%` }} />
        </div>
        <p className="mt-1.5 flex items-center justify-between text-[11px] text-white/45">
          <span>{bootName ? <span className="text-[var(--bn-gold)]">🥇 {bootName}</span> : t.scorers.crownPrompt}</span>
          {picks.length > 0 && <span className="text-white/35">⚽ {t.scorers.goalsSet(goalsSet, picks.length)}</span>}
        </p>
      </div>

      {picks.length > 0 && (
        <div className="space-y-2">
          {picks.map((p) => (
            <PickRow key={p.id} player={p} isBoot={bootId === p.id} predictedGoals={goalsByPlayer[p.id] ?? null} locked={locked}
              onSetBoot={() => makeBoot(p.id)} onRemove={() => remove(p.id)} onGoals={(v) => goals(p.id, v)} />
          ))}
        </div>
      )}

      {!locked && picks.length < 10 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.addPlayers}</p>
          <PlayerSearch contenders={contenders} chosenIds={chosenIds} onAdd={add} />
        </div>
      )}
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
