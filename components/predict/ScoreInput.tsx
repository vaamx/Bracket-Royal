"use client";

interface ScoreInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  "aria-label": string;
}

/** A single 0–99 score box. Empty string maps to null (unpredicted). */
export function ScoreInput({ value, onChange, disabled, ...rest }: ScoreInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      disabled={disabled}
      aria-label={rest["aria-label"]}
      value={value ?? ""}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange(null);
        const n = Math.max(0, Math.min(99, Math.floor(Number(v))));
        onChange(Number.isNaN(n) ? null : n);
      }}
      className={
        "w-11 h-12 rounded-xl text-center text-xl font-extrabold tabular-nums " +
        "bg-black/40 border outline-none transition-colors " +
        (disabled
          ? "border-white/10 text-white/50"
          : "border-[var(--bn-gold)]/40 text-white focus:border-[var(--bn-gold)]")
      }
    />
  );
}
