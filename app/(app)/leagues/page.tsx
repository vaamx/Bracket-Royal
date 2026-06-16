import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyLeaguesDetailed, getSessionProfile, type LeagueCard } from "@/lib/leagues/queries";
import { createLeagueForm, joinLeagueForm } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getEarnedBadges } from "@/lib/achievements/queries";
import { BadgeStrip } from "@/components/ui/BadgeStrip";
import { getT, type Dictionary } from "@/lib/i18n";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function LeagueRow({ l, t }: { l: LeagueCard; t: Dictionary }) {
  return (
    <Link href={`/leagues/${l.id}`} className="block">
      <Card className="flex items-center gap-3 transition-colors hover:bg-white/[0.06]">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/5 text-xl" aria-hidden>
          {l.is_global ? "🌍" : "🛡️"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{l.name}</p>
          <p className="text-xs text-white/45">
            {t.common.players(l.memberCount)}
            {!l.is_global && (
              <>
                {" · "}
                <span className="font-mono font-bold text-[var(--bn-gold)]">{l.invite_code}</span>
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-black tabular-nums text-[var(--bn-gold)]">{l.myRank ? ordinal(l.myRank) : "—"}</p>
          <p className="text-[10px] font-bold text-white/40">{l.myPoints} {t.leagues.pts}</p>
        </div>
      </Card>
    </Link>
  );
}

export default async function LeaguesPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { code: invitedCode } = await searchParams;
  const isAnonymous = user.is_anonymous === true;
  const [profile, leagues, badges] = await Promise.all([
    getSessionProfile(),
    getMyLeaguesDetailed(),
    getEarnedBadges(),
  ]);
  const displayName = profile?.display_name ?? (isAnonymous ? t.common.guest : t.common.player);
  const global = leagues.find((l) => l.is_global);
  const friendLeagues = leagues.filter((l) => !l.is_global);

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.leagues.yourLeagues}</p>
        <h1 className="text-2xl font-black">{t.leagues.hi(displayName)}</h1>
      </header>

      {/* Global standing hero */}
      {global && (
        <Link href={`/leagues/${global.id}`} className="block">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[var(--bn-accent)]/15 to-transparent p-5">
            <p className="text-xs font-bold uppercase tracking-[1.5px] text-[var(--bn-accent)]">{t.leagues.globalLeaderboard}</p>
            <div className="mt-2 flex items-end justify-between">
              <div>
                <p className="text-3xl font-black text-white">
                  {global.myRank ? ordinal(global.myRank) : t.leagues.unranked}
                </p>
                <p className="text-xs text-white/50">
                  {global.myRank ? t.leagues.rankSummary(global.memberCount, global.myPoints) : t.leagues.getOnBoard}
                </p>
              </div>
              <span className="text-4xl" aria-hidden>🌍</span>
            </div>
          </div>
        </Link>
      )}

      <BadgeStrip earned={badges} />

      {isAnonymous && (
        <Link href="/login" className="block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center text-sm text-white/60">
            {t.leagues.guestNudge} <span className="font-semibold text-[var(--bn-gold)]">{t.leagues.guestNudgeLink}</span>
          </div>
        </Link>
      )}

      {/* Invited via a shared link */}
      {invitedCode && (
        <Card className="space-y-3 border-[var(--bn-gold)]/40">
          <div>
            <h2 className="font-bold">{t.leagues.invitedTitle}</h2>
            <p className="text-xs text-white/55">{t.leagues.invitedSub}</p>
          </div>
          <form action={joinLeagueForm} className="flex gap-2">
            <Input name="code" defaultValue={invitedCode.toUpperCase()} className="font-mono uppercase" required />
            <Button type="submit">{t.leagues.join}</Button>
          </form>
        </Card>
      )}

      {/* Friend leagues */}
      {friendLeagues.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.leagues.friendLeagues}</h2>
          {friendLeagues.map((l) => (
            <LeagueRow key={l.id} l={l} t={t} />
          ))}
        </section>
      )}

      {/* Create a league */}
      <Card className="space-y-3">
        <div>
          <h2 className="font-bold">{t.leagues.createTitle}</h2>
          <p className="text-xs text-white/50">{t.leagues.createSub}</p>
        </div>
        <form action={createLeagueForm} className="flex gap-2">
          <Input name="name" placeholder={t.leagues.leagueNamePlaceholder} required />
          <Button type="submit">{t.leagues.create}</Button>
        </form>
      </Card>

      {/* Join a league */}
      <Card className="space-y-3">
        <h2 className="font-bold">{t.leagues.haveCode}</h2>
        <form action={joinLeagueForm} className="flex gap-2">
          <Input name="code" placeholder={t.leagues.enterCode} className="font-mono uppercase" required />
          <Button type="submit" variant="ghost">{t.leagues.join}</Button>
        </form>
      </Card>
    </main>
  );
}
