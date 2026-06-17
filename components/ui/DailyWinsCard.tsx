"use client";

import type { DailyWinRow } from "@/lib/wins/queries";
import { useI18n } from "@/lib/i18n/provider";

export function DailyWinsCard({ wins }: { wins: DailyWinRow[] }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.dailyWins.title}</p>
        {wins.length > 0 && <p className="text-xs font-bold text-[var(--bn-gold)] tabular-nums">🏅 {wins.length}</p>}
      </div>
      {wins.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-white/45">{t.dailyWins.empty}</p>
      ) : (
        <div className="space-y-2">
          {wins.map((w) => (
            <div key={w.winKey} className="flex items-center gap-3 rounded-xl border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/[0.07] px-3 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/30 text-lg" aria-hidden>{w.kind === "exact" ? "🎯" : "⚽"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[var(--bn-gold)]">{w.kind === "exact" ? t.dailyWins.kindExact : t.dailyWins.kindGoals}</span>
                <span className="block truncate text-[11px] text-white/55">{w.detail}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
