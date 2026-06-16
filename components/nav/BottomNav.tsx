"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/predict", label: "Predict", icon: "⚽" },
  { href: "/bracket", label: "Bracket", icon: "🏆" },
  { href: "/leagues", label: "Leagues", icon: "👥" },
  { href: "/settings", label: "Account", icon: "⚙️" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[var(--bn-bg-deep)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold transition-colors " +
                (active ? "text-[var(--bn-gold)]" : "text-white/45 hover:text-white/70")
              }
            >
              <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
