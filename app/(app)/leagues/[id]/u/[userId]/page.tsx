import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMemberPredictions, type MemberPredItem } from "@/lib/leagues/memberPredictions";
import { getMemberStanding } from "@/lib/leagues/queries";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { getT } from "@/lib/i18n";
import type { Dictionary } from "@/lib/i18n";

function roundLabel(item: MemberPredItem, t: Dictionary): string {
  if (item.stage === "group") return t.predict.group(item.groupLabel ?? "");
  const map: Record<string, string> = {
    r32: t.bracket.roundOf32, r16: t.bracket.roundOf16, qf: t.bracket.quarterfinals,
    sf: t.bracket.semifinals, final: t.bracket.final, third: t.bracket.final,
  };
  return map[item.stage] ?? item.stage.toUpperCase();
}

function PickRow({ item, t }: { item: MemberPredItem; t: Dictionary }) {
  const hasScore = item.predHome !== null && item.predAway !== null;
  const winner = item.predWinnerId;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[1.5px] text-white/35">{roundLabel(item, t)}</p>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex w-[38%] items-center justify-end gap-1.5 truncate text-right">
          <span className="truncate">{item.home?.name ?? "—"}</span>
          <span aria-hidden>{item.home?.flag}</span>
        </span>
        <span className="shrink-0 font-black tabular-nums text-[var(--bn-gold)]">
          {hasScore ? `${item.predHome}–${item.predAway}` : winner ? `→ ${winner}` : "—"}
        </span>
        <span className="flex w-[38%] items-center gap-1.5 truncate">
          <span aria-hidden>{item.away?.flag}</span>
          <span className="truncate">{item.away?.name ?? "—"}</span>
        </span>
      </div>
      {item.final && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-bold text-white/50">{t.leagues.ftShort} {item.homeScore}–{item.awayScore}</span>
          {item.verdict && (
            <span className={"font-extrabold " + (item.verdict === "exact" ? "text-[var(--bn-gold)]" : item.verdict === "result" ? "text-[var(--bn-success)]" : "text-red-400")}>
              {item.verdict === "exact" ? t.predict.exactPts : item.verdict === "result" ? t.predict.resultPts : t.predict.missed}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default async function MemberPicksPage({ params }: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId } = await params;
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [view, standing] = await Promise.all([
    getMemberPredictions(id, userId, user.id),
    getMemberStanding(id, userId),
  ]);
  if (!view) notFound();

  const name = view.displayName ?? t.common.guest;
  const bd = standing.breakdown;
  const showBreakdown = !!bd && standing.points > 0 && bd.group + bd.ko + bd.scorer === standing.points;

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <Link href={`/leagues/${id}`} className="inline-block text-sm text-white/50 hover:text-white/80">← {t.leagues.leaderboard}</Link>

      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.leagues.leaderboard}</p>
        <h1 className="text-2xl font-black">{t.leagues.picksOf(name)}</h1>
        <p className="mt-1 text-xs text-white/45">{t.leagues.lockedNote}</p>
      </div>

      {/* Standing + how they earned it */}
      <div className="rounded-2xl border border-[var(--bn-gold)]/25 bg-gradient-to-br from-[var(--bn-gold)]/[0.10] to-transparent p-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="text-xs text-white/45">
              {standing.rank ? `#${standing.rank}` : "—"} · {t.score.exact}: <span className="tabular-nums">{standing.exactCount}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tabular-nums text-[var(--bn-gold)]">{standing.points}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-white/45">{t.score.points}</p>
          </div>
        </div>
        {showBreakdown && bd && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
            {([
              [t.score.breakGroup, bd.group, "⚽"],
              [t.score.breakKo, bd.ko, "🏆"],
              [t.score.breakScorers, bd.scorer, "🥇"],
            ] as const).map(([label, val, icon]) => (
              <div key={label}>
                <p className="text-base font-black tabular-nums">{val}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-white/45">{icon} {label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {view.locked.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center">
          <div className="text-3xl">🔒</div>
          <p className="mt-2 text-sm text-white/50">{t.leagues.noPicks}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {view.locked.map((item) => (
            <PickRow key={item.matchId} item={item} t={t} />
          ))}
        </div>
      )}

      {view.hiddenCount > 0 && (
        <p className="text-center text-xs text-white/40">{t.leagues.hidden(view.hiddenCount)}</p>
      )}

      {view.scorerPicks.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.leagues.scorerPicksTitle}</p>
          <div className="flex flex-wrap gap-2">
            {view.scorerPicks.map((s) => (
              <span key={s.playerId} className={"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold " + (s.isBoot ? "border-[var(--bn-gold)] text-[var(--bn-gold)]" : "border-white/12 text-white/80")}>
                {s.isBoot && <span aria-hidden>🥇</span>}<span aria-hidden>{s.flag ?? "🏳️"}</span>{s.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
