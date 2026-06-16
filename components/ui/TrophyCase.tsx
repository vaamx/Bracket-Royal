"use client";

import { BADGE_LIST } from "@/lib/achievements/badges";
import { useI18n } from "@/lib/i18n/provider";

/** The full badge set with earned ones lit up and the rest locked — so players
 *  see both what they've won and what's left to chase. */
export function TrophyCase({ earned }: { earned: string[] }) {
  const { t } = useI18n();
  const earnedSet = new Set(earned);
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.achievements.title}</p>
        <p className="text-xs font-bold text-white/45 tabular-nums">{t.achievements.count(earnedSet.size, BADGE_LIST.length)}</p>
      </div>
      <div className="space-y-2">
        {BADGE_LIST.map((b) => {
          const got = earnedSet.has(b.key);
          const tr = t.badges[b.key] ?? { label: b.label, desc: b.desc };
          return (
            <div key={b.key} className={"flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors " + (got ? "border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/[0.08]" : "border-white/10 bg-white/[0.02] opacity-55")}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black/30 text-lg" aria-hidden>{got ? b.emoji : "🔒"}</span>
              <span className="min-w-0">
                <span className={"block text-sm font-bold " + (got ? "text-[var(--bn-gold)]" : "text-white/70")}>{tr.label}</span>
                <span className="block truncate text-[11px] text-white/45">{tr.desc}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
