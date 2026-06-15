"use client";

export function RoundStepper({
  rounds, active, completed, onSelect,
}: {
  rounds: Array<{ stage: string; label: string }>;
  active: number;
  completed: Record<string, boolean>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {rounds.map((r, i) => {
        const isActive = i === active;
        const isDone = completed[r.stage];
        return (
          <button
            key={r.stage}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            className={
              "h-9 flex-1 rounded-lg text-xs font-extrabold transition-colors " +
              (isActive
                ? "bg-[var(--bn-gold)] text-[#0a1428]"
                : isDone
                ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)] border border-[var(--bn-success)]/40"
                : "bg-white/5 text-white/60 border border-white/10")
            }
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
