import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={
        "w-full h-11 rounded-xl bg-black/30 border border-white/15 px-4 text-sm " +
        "text-white placeholder:text-white/40 outline-none focus:border-[var(--bn-gold)] " +
        "transition-colors " +
        className
      }
      {...props}
    />
  );
}
