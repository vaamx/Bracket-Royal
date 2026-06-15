import { BADGES, type BadgeKey } from "@/lib/achievements/badges";

export function BadgeStrip({ earned }: { earned: string[] }) {
  if (earned.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {earned.map((key) => {
        const b = BADGES[key as BadgeKey];
        if (!b) return null;
        return (
          <span key={key} title={b.desc} className="inline-flex items-center gap-1 rounded-full border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/10 px-2.5 py-1 text-xs font-bold text-[var(--bn-gold)]">
            <span aria-hidden>{b.emoji}</span> {b.label}
          </span>
        );
      })}
    </div>
  );
}
