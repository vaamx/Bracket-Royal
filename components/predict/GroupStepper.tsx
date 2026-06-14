"use client";

export function GroupStepper({
  labels,
  active,
  completed,
  onSelect,
}: {
  labels: string[];
  active: number;
  completed: Record<string, boolean>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map((label, i) => {
        const isActive = i === active;
        const isDone = completed[label];
        return (
          <button
            key={label}
            onClick={() => onSelect(i)}
            aria-current={isActive}
            className={
              "h-9 w-9 rounded-full text-sm font-extrabold transition-colors " +
              (isActive
                ? "bg-[var(--bn-gold)] text-[#0a1428]"
                : isDone
                ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)] border border-[var(--bn-success)]/40"
                : "bg-white/5 text-white/60 border border-white/10")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
