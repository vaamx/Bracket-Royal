import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeaderboard } from "@/lib/leaderboard/queries";
import { LeaderboardClient } from "./leaderboard-client";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getLeaderboard(id);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/leagues" className="text-sm text-white/50 hover:text-white/80">← Leagues</Link>
        {!data.league.isGlobal && (
          <span className="text-xs text-white/50">Code <span className="font-mono text-[var(--bn-gold)]">{data.league.inviteCode}</span></span>
        )}
      </div>
      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">LEADERBOARD</p>
        <h1 className="text-2xl font-black">{data.league.name}</h1>
      </div>
      <LeaderboardClient leagueId={data.league.id} initialRows={data.rows} />
    </main>
  );
}
