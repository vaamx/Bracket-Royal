import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMemberPredictions, type MemberPredItem } from "@/lib/leagues/memberPredictions";
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

  const view = await getMemberPredictions(id, userId, user.id);
  if (!view) notFound();

  const name = view.displayName ?? t.common.guest;

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <Link href={`/leagues/${id}`} className="inline-block text-sm text-white/50 hover:text-white/80">← {t.leagues.leaderboard}</Link>

      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.leagues.leaderboard}</p>
        <h1 className="text-2xl font-black">{t.leagues.picksOf(name)}</h1>
        <p className="mt-1 text-xs text-white/45">{t.leagues.lockedNote}</p>
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
    </main>
  );
}
