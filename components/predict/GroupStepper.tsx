"use client";

export function GroupStepper({
  labels,
  active,
  progress,
  onSelect,
}: {
  labels: string[];
  active: number;
  progress: Record<string, { done: number; total: number }>;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {labels.map((label, i) => {
        const isActive = i === active;
        const p = progress[label] ?? { done: 0, total: 0 };
        const isDone = p.total > 0 && p.done === p.total;
        const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
        // A conic-gradient ring shows partial progress; the inner disc holds the letter.
        const ringColor = isDone ? "var(--bn-success)" : "var(--bn-gold)";
        return (
          <button
            key={label}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            aria-label={`Group ${label}, ${p.done} of ${p.total} predicted`}
            className="relative grid h-10 w-10 place-items-center rounded-full transition-transform active:scale-95"
            style={{
              background: `conic-gradient(${ringColor} ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
            }}
          >
            <span
              className={
                "grid h-[34px] w-[34px] place-items-center rounded-full text-sm font-extrabold " +
                (isActive
                  ? "bg-[var(--bn-gold)] text-[#0a1428]"
                  : isDone
                  ? "bg-[#0d1830] text-[var(--bn-success)]"
                  : "bg-[#0d1830] text-white/70")
              }
            >
              {isDone && !isActive ? "✓" : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
