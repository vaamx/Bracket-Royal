import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { getT } from "@/lib/i18n";
import { InviteShare } from "@/components/leagues/InviteShare";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { t } = await getT();
  const [{ data: { user } }, data] = await Promise.all([
    supabase.auth.getUser(),
    getLeaderboard(id),
  ]);
  if (!data) notFound();

  const players = data.rows.length;

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <Link href="/leagues" className="inline-block text-sm text-white/50 hover:text-white/80">← {t.nav.leagues}</Link>

      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-2xl" aria-hidden>
          {data.league.isGlobal ? "🌍" : "🛡️"}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.leagues.leaderboard}</p>
          <h1 className="truncate text-2xl font-black">{data.league.name}</h1>
          <p className="text-xs text-white/45">{t.common.players(players)}</p>
        </div>
      </div>

      {!data.league.isGlobal && (
        <InviteShare code={data.league.inviteCode} leagueName={data.league.name} />
      )}

      <LeaderboardClient leagueId={data.league.id} initialRows={data.rows} meId={user?.id ?? null} />
    </main>
  );
}
