import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm " +
        "shadow-[0_20px_50px_rgba(0,0,0,0.4)] p-4 " +
        className
      }
    >
      {children}
    </div>
  );
}
