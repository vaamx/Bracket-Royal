import Link from "next/link";
import { getPlayerProfile } from "@/lib/players/queries";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";
import { getT } from "@/lib/i18n";
import { ProfilePickActions } from "@/components/players/ProfilePickActions";

/** Two-letter initials for the generated avatar (first + last name word). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  const p = await getPlayerProfile(id);
  if (!p) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🤷</div>
        <h1 className="mt-3 text-2xl font-black">{t.player.notFound}</h1>
        <Link href="/scorers" className="mt-4 text-sm font-semibold text-white/50 hover:text-white/80">← {t.player.back}</Link>
      </main>
    );
  }
  const s = DEFAULT_SCORING_CONFIG.scorer;

  return (
    <main className="mx-auto max-w-md space-y-5 p-6 pb-24">
      <Link href="/scorers" className="inline-block text-sm text-white/50 hover:text-white/80">← {t.player.back}</Link>

      {/* Hero card: generated avatar + identity */}
      <div className={"relative overflow-hidden rounded-3xl border p-6 text-center " + (p.isMyGoldenBoot ? "border-[var(--bn-gold)]/50 bg-gradient-to-b from-[var(--bn-gold)]/15 to-transparent" : "border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent")}>
        <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-40 w-40 rounded-full bg-[var(--bn-gold)]/10 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[#1c2c4d] to-[#0a1428] text-3xl font-black text-white/90 ring-2 ring-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
          {initialsOf(p.name)}
          <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-[var(--bn-bg-deep)] text-xl ring-2 ring-[var(--bn-bg-deep)]" aria-hidden>{p.flag ?? "🏳️"}</span>
          {p.isMyGoldenBoot && <span className="absolute -top-1 -left-1 text-2xl drop-shadow" aria-hidden>🥇</span>}
        </div>
        <p className="mt-3 text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.player.eyebrow}</p>
        <h1 className="text-2xl font-black">{p.name}</h1>
        <p className="text-sm text-white/55">{p.teamName ?? p.teamId}{p.position ? ` · ${p.position}` : ""}</p>
        {(p.inMyTop10 || p.isMyGoldenBoot) && (
          <p className="mt-2 inline-block rounded-full bg-[var(--bn-gold)]/15 px-3 py-1 text-xs font-bold text-[var(--bn-gold)]">
            {p.isMyGoldenBoot ? t.player.yourGoldenBoot : t.player.onYourTop10}
          </p>
        )}
      </div>

      {/* Stats grid — live tournament data + your prediction */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-[var(--bn-gold)] tabular-nums">{p.goals}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-white/45">{t.player.wcGoals}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-white tabular-nums">{p.scorerRank ? `#${p.scorerRank}` : "—"}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-white/45">{p.scorerRank ? t.player.rankLabel : t.player.unranked}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black tabular-nums text-[var(--bn-accent)]">{p.myPredictedGoals != null ? p.myPredictedGoals : "—"}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-white/45">{t.player.yourPrediction}</p>
        </div>
      </div>

      {/* How this player earns you points */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.player.scoringTitle}</p>
        <ul className="mt-2 space-y-1.5 text-sm text-white/70">
          <li>🎯 {t.player.scoringHit(s.hit)}</li>
          <li>⚽ {t.player.scoringGoals(s.goalsExact, s.goalsClose)}</li>
          <li>🥇 {t.player.scoringBoot(s.boot, s.bootExact)}</li>
        </ul>
      </div>

      {/* Pick popularity + actions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.player.predictions}</p>
        <p className="mt-1.5 text-sm text-white/75">
          🔮 {t.player.pickedBy(p.pickCount)}
          {p.bootCount > 0 && <span className="text-[var(--bn-gold)]"> · 🥇 {t.player.asBoot(p.bootCount)}</span>}
        </p>
        <div className="mt-3">
          <ProfilePickActions playerId={p.id} inMyTop10={p.inMyTop10} isMyGoldenBoot={p.isMyGoldenBoot} predictedGoals={p.myPredictedGoals} locked={p.locked} />
        </div>
      </div>
    </main>
  );
}
