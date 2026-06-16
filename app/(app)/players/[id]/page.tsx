import Link from "next/link";
import { getPlayerProfile } from "@/lib/players/queries";
import { getT } from "@/lib/i18n";
import { ProfilePickActions } from "@/components/players/ProfilePickActions";

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
  return (
    <main className="mx-auto max-w-md space-y-5 p-6 pb-24">
      <Link href="/scorers" className="inline-block text-sm text-white/50 hover:text-white/80">← {t.player.back}</Link>
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[var(--bn-gold)]/10 to-transparent p-6 text-center">
        <div className="text-6xl">{p.flag ?? "🏳️"}</div>
        <p className="mt-2 text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.player.eyebrow}</p>
        <h1 className="text-2xl font-black">{p.name}</h1>
        <p className="text-sm text-white/55">{p.teamName ?? p.teamId}{p.position ? ` · ${p.position}` : ""}</p>
        {(p.inMyTop10 || p.isMyGoldenBoot) && (
          <p className="mt-2 inline-block rounded-full bg-[var(--bn-gold)]/15 px-3 py-1 text-xs font-bold text-[var(--bn-gold)]">
            {p.isMyGoldenBoot ? t.player.yourGoldenBoot : t.player.onYourTop10}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-[var(--bn-gold)]">{p.goals}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t.player.wcGoals}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center">
          <p className="text-3xl font-black text-white">{p.scorerRank ? `#${p.scorerRank}` : "—"}</p>
          <p className="text-[11px] font-bold uppercase tracking-wide text-white/45">{p.scorerRank ? t.player.rank(p.scorerRank) : t.player.unranked}</p>
        </div>
      </div>

      {/* Pick popularity + actions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.player.predictions}</p>
        <p className="mt-1.5 text-sm text-white/75">
          🔮 {t.player.pickedBy(p.pickCount)}
          {p.bootCount > 0 && <span className="text-[var(--bn-gold)]"> · 🥇 {t.player.asBoot(p.bootCount)}</span>}
        </p>
        <div className="mt-3">
          <ProfilePickActions playerId={p.id} inMyTop10={p.inMyTop10} isMyGoldenBoot={p.isMyGoldenBoot} locked={p.locked} />
        </div>
      </div>
    </main>
  );
}
