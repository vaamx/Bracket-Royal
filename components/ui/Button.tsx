import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "gold" | "ghost";

export function Button({
  children,
  variant = "gold",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-5 h-11 font-extrabold " +
    "text-sm transition-transform active:scale-95 disabled:opacity-50";
  const styles =
    variant === "gold"
      ? "bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-[#0a1428]"
      : "border border-white/15 text-white/90 hover:bg-white/5";
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}
