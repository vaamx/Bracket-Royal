import Link from "next/link";
import { getT } from "@/lib/i18n";
import { LocaleToggle } from "@/components/i18n/LocaleToggle";

const FLAGS = ["🇲🇽", "🇺🇸", "🇨🇦", "🇧🇷", "🇦🇷", "🇫🇷", "🇪🇸", "🇩🇪", "🇵🇹", "🇳🇱", "🇧🇪", "🇭🇷", "🇲🇦", "🇯🇵", "🇰🇷", "🇸🇳", "🇺🇾", "🇨🇴", "🇨🇭", "🇬🇭"];

export default async function Home() {
  const { t } = await getT();
  const features = [
    { icon: "🔮", title: t.home.featPredictTitle, copy: t.home.featPredictCopy },
    { icon: "🏆", title: t.home.featBracketTitle, copy: t.home.featBracketCopy },
    { icon: "📈", title: t.home.featBoardTitle, copy: t.home.featBoardCopy },
  ];
  const stats = [
    { n: "48", label: t.home.statTeams },
    { n: "104", label: t.home.statMatches },
    { n: "16", label: t.home.statCities },
  ];

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10">
      {/* Top row: brand + language */}
      <div className="flex items-center justify-between pt-5">
        <span className="flex items-center gap-1.5 text-sm font-black">
          <span aria-hidden>🏆</span> {t.nav.brand}
        </span>
        <LocaleToggle />
      </div>

      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center pt-6 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 -z-10 blur-2xl" aria-hidden>
            <div className="mx-auto h-28 w-28 rounded-full bg-[var(--bn-gold)]/30" />
          </div>
          <div className="bn-float text-7xl drop-shadow-[0_8px_30px_rgba(212,175,55,0.45)]">🏆</div>
        </div>

        <p className="text-xs font-bold tracking-[4px] text-[var(--bn-accent)]">{t.home.eyebrow}</p>
        <h1 className="mt-3 text-5xl font-black leading-[1.05]">
          <span className="bg-gradient-to-b from-white to-white/55 bg-clip-text text-transparent">{t.home.title1}</span>
          <br />
          <span className="bg-gradient-to-r from-[#d4af37] to-[#f4d56a] bg-clip-text text-transparent">{t.home.title2}</span>
        </h1>
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/60">{t.home.subtitle}</p>

        {/* Stat chips */}
        <div className="mt-7 flex w-full items-stretch gap-2">
          {stats.map((s) => (
            <div key={s.label} className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <p className="text-xl font-black text-[var(--bn-gold)]">{s.n}</p>
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex w-full flex-col gap-3">
          <Link
            href="/predict"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-base font-black text-[#0a1428] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-transform active:scale-[0.98]"
          >
            {t.home.startCta}
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-2xl text-sm font-semibold text-white/55 transition-colors hover:text-white/80"
          >
            {t.home.signinCta}
          </Link>
        </div>
      </div>

      {/* Flag ticker */}
      <div className="mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="bn-marquee flex w-max gap-4 text-2xl">
          {[...FLAGS, ...FLAGS].map((f, i) => (
            <span key={i} aria-hidden>{f}</span>
          ))}
        </div>
      </div>

      {/* Feature strip */}
      <div className="mt-8 space-y-2.5">
        {features.map((f) => (
          <div key={f.title} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <span className="text-2xl" aria-hidden>{f.icon}</span>
            <div>
              <p className="text-sm font-bold text-white/90">{f.title}</p>
              <p className="text-xs text-white/50">{f.copy}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-white/35">{t.home.noAccount}</p>
    </main>
  );
}
