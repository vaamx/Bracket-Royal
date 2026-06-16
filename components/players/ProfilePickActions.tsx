"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addScorerPick, removeScorerPick, setGoldenBoot, setPickGoals } from "@/lib/players/actions";
import { useI18n } from "@/lib/i18n/provider";

type ActionResult = { ok?: true; error?: string };

/** Add/remove this player to your Top 10, crown them Golden Boot, and predict their goals — from the profile. */
export function ProfilePickActions({ playerId, inMyTop10, isMyGoldenBoot, predictedGoals, locked }: {
  playerId: string; inMyTop10: boolean; isMyGoldenBoot: boolean; predictedGoals: number | null; locked: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (locked) return null;

  function run(fn: () => Promise<ActionResult>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r.error) setErr(r.error === "max" ? t.scorers.errMax : r.error === "locked" ? t.scorers.errLocked : t.scorers.errGeneric);
      else router.refresh();
    });
  }

  const Btn = ({ onClick, children, gold }: { onClick: () => void; children: React.ReactNode; gold?: boolean }) => (
    <button onClick={onClick} disabled={pending}
      className={"rounded-full px-4 py-2 text-sm font-bold transition-transform active:scale-95 disabled:opacity-50 " + (gold ? "bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-[#0a1428]" : "border border-white/15 text-white/80")}>
      {children}
    </button>
  );

  return (
    <div className="space-y-3">
      {inMyTop10 && (
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="text-sm font-semibold text-white/70">⚽ {t.player.predictGoals}</span>
          <input
            type="number" inputMode="numeric" min={0} max={30} disabled={pending}
            aria-label={t.player.predictGoals} placeholder="–" defaultValue={predictedGoals ?? ""}
            onChange={(e) => {
              const v = e.target.value === "" ? null : Math.max(0, Math.min(30, Math.floor(Number(e.target.value))));
              run(() => setPickGoals(playerId, v));
            }}
            className="h-9 w-16 rounded-lg border border-white/15 bg-black/30 text-center text-base font-black tabular-nums outline-none [appearance:textfield] placeholder:text-white/25 [&::-webkit-inner-spin-button]:appearance-none focus:border-[var(--bn-gold)]"
          />
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {!inMyTop10 && <Btn gold onClick={() => run(() => addScorerPick(playerId))}>{t.player.addPick}</Btn>}
        {inMyTop10 && !isMyGoldenBoot && <Btn gold onClick={() => run(() => setGoldenBoot(playerId))}>{t.player.makeBoot}</Btn>}
        {inMyTop10 && <Btn onClick={() => run(() => removeScorerPick(playerId))}>{t.player.removePick}</Btn>}
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </div>
  );
}
