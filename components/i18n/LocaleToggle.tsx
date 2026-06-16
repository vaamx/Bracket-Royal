"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/provider";
import { locales, type Locale } from "@/lib/i18n/locales";

/** EN/ES segmented switch. Persists choice in a cookie and refreshes server data. */
export function LocaleToggle() {
  const { locale } = useI18n();
  const router = useRouter();

  function set(l: Locale) {
    if (l === locale) return;
    document.cookie = `locale=${l}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div className="flex items-center rounded-full border border-white/15 bg-white/[0.04] p-0.5 text-[11px] font-extrabold">
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => set(l)}
          aria-pressed={locale === l}
          className={
            "rounded-full px-2 py-0.5 uppercase transition-colors " +
            (locale === l ? "bg-[var(--bn-gold)] text-[#0a1428]" : "text-white/55")
          }
        >
          {l}
        </button>
      ))}
    </div>
  );
}
