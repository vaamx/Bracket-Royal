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
    <div className={"rounded-2xl border px-3 py-2.5 transition-colors " + (isBoot ? "border-[var(--bn-gold)] bg-[var(--bn-gold)]/[0.06]" : "border-white/10 bg-white/[0.02]")}>
      <div className="flex items-center gap-2">
        <button onClick={onSetBoot} disabled={locked} aria-label={t.scorers.setBoot} className={"text-lg " + (isBoot ? "" : "opacity-30 hover:opacity-70")}>{isBoot ? "🥇" : "☆"}</button>
        <span className="text-lg" aria-hidden>{player.flag ?? "🏳️"}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Link href={`/players/${player.id}`} className="hover:underline">{player.name}</Link>
          {" "}<span className="text-white/40">{player.teamId}</span>
        </span>
        {actualGoals != null && <span className="shrink-0 text-xs text-white/55">{t.scorers.goals(actualGoals)}{inTop10 ? " ✓" : ""}</span>}

        {/* Predicted goal tally — editable per pick until lock */}
        <label className={"flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 " + (predictedGoals != null ? "border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/10" : "border-white/10 bg-black/20")}>
          <span className="text-[11px]" aria-hidden>⚽</span>
          <input
            type="number" inputMode="numeric" min={0} max={30} disabled={locked}
            aria-label={t.scorers.predictedGoals} placeholder="–"
            defaultValue={predictedGoals ?? ""}
            onChange={(e) => onGoals(e.target.value === "" ? null : Math.max(0, Math.min(30, Math.floor(Number(e.target.value)))))}
            className="h-6 w-8 bg-transparent text-center text-sm font-black tabular-nums outline-none [appearance:textfield] placeholder:text-white/25 [&::-webkit-inner-spin-button]:appearance-none"
          />
        </label>

        {!locked && <button onClick={onRemove} aria-label={t.scorers.remove} className="shrink-0 text-xs font-bold text-red-400/80">✕</button>}
      </div>
    </div>
  );
}
