"use client";

export function RoundStepper({
  rounds, active, counts, onSelect,
}: {
  rounds: Array<{ stage: string; label: string }>;
  active: number;
  counts: Record<string, { done: number; total: number }>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {rounds.map((r, i) => {
        const isActive = i === active;
        const c = counts[r.stage] ?? { done: 0, total: 0 };
        const isDone = c.total > 0 && c.done === c.total;
        const pct = c.total > 0 ? c.done / c.total : 0;
        return (
          <button
            key={r.stage}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            className={
              "relative flex-1 overflow-hidden rounded-xl px-1 py-1.5 text-center transition-colors " +
              (isActive
                ? "bg-[var(--bn-gold)] text-[#0a1428]"
                : isDone
                ? "bg-[var(--bn-success)]/15 text-[var(--bn-success)] border border-[var(--bn-success)]/40"
                : "bg-white/5 text-white/55 border border-white/10")
            }
          >
            <span className="block text-[11px] font-black leading-tight">{r.label}</span>
            <span className="block text-[9px] font-bold opacity-80">
              {isDone ? "✓" : `${c.done}/${c.total}`}
            </span>
            {!isActive && !isDone && pct > 0 && (
              <span
                className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--bn-gold)]"
                style={{ width: `${pct * 100}%` }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
