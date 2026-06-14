import Link from "next/link";

const FEATURES = [
  { icon: "🔮", title: "Predict every match", copy: "Call the score of all 72 group games, group by group." },
  { icon: "🏆", title: "Build your bracket", copy: "Ride your picks all the way to the final." },
  { icon: "📈", title: "Climb the leaderboard", copy: "Score live as real results roll in." },
];

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-16">
      {/* Hero */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="mb-6 text-7xl drop-shadow-[0_8px_30px_rgba(212,175,55,0.35)]">🏆</div>
        <p className="text-xs font-bold tracking-[4px] text-[var(--bn-accent)]">
          FIFA WORLD CUP 2026
        </p>
        <h1 className="mt-3 bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-black leading-[1.05] text-transparent">
          Predict the<br />World Cup
        </h1>
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/60">
          Pick every match, build your knockout bracket, and climb the live leaderboard with your friends.
        </p>

        <div className="mt-9 flex w-full flex-col gap-3">
          <Link
            href="/predict"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f4d56a] text-base font-black text-[#0a1428] shadow-[0_10px_30px_rgba(212,175,55,0.35)] transition-transform active:scale-[0.98]"
          >
            Start predicting →
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 items-center justify-center rounded-2xl text-sm font-semibold text-white/55 transition-colors hover:text-white/80"
          >
            Sign in to save &amp; compete
          </Link>
        </div>
      </div>

      {/* Feature strip */}
      <div className="mt-10 space-y-2.5">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <span className="text-2xl" aria-hidden>{f.icon}</span>
            <div>
              <p className="text-sm font-bold text-white/90">{f.title}</p>
              <p className="text-xs text-white/50">{f.copy}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-white/35">No account needed — just start picking.</p>
    </main>
  );
}
