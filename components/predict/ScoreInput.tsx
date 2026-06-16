"use client";

interface ScoreInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  highlight?: boolean;
  "aria-label": string;
}

/** A single 0–99 score box. Empty string maps to null (unpredicted). */
export function ScoreInput({ value, onChange, disabled, highlight, ...rest }: ScoreInputProps) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      disabled={disabled}
      aria-label={rest["aria-label"]}
      value={value ?? ""}
      placeholder="–"
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") return onChange(null);
        const n = Math.max(0, Math.min(99, Math.floor(Number(v))));
        onChange(Number.isNaN(n) ? null : n);
      }}
      className={
        "h-14 w-12 rounded-xl text-center text-2xl font-black tabular-nums outline-none transition-all " +
        "appearance-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none " +
        "placeholder:text-white/20 " +
        (disabled
          ? "border border-white/10 bg-white/[0.03] text-white/70"
          : highlight
          ? "border-2 border-[var(--bn-gold)] bg-[var(--bn-gold)]/15 text-white shadow-[0_0_18px_-6px_rgba(212,175,55,0.7)]"
          : "border border-white/15 bg-black/30 text-white focus:border-[var(--bn-gold)] focus:bg-black/50")
      }
    />
  );
}
