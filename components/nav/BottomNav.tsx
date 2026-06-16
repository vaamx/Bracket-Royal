"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const TABS = [
    { href: "/predict", label: t.nav.predict, icon: "⚽" },
    { href: "/bracket", label: t.nav.bracket, icon: "🏆" },
    { href: "/scorers", label: t.scorers.tab, icon: "🥇" },
    { href: "/leagues", label: t.nav.leagues, icon: "👥" },
    { href: "/settings", label: t.nav.account, icon: "⚙️" },
  ];
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
