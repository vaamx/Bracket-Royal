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
