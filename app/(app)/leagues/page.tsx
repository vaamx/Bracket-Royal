import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyLeagues, getSessionProfile } from "@/lib/leagues/queries";
import { createLeagueForm, joinLeagueForm } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getEarnedBadges } from "@/lib/achievements/queries";
import { BadgeStrip } from "@/components/ui/BadgeStrip";

export default async function LeaguesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const isAnonymous = user.is_anonymous === true;
  const [profile, leagues, badges] = await Promise.all([
    getSessionProfile(),
    getMyLeagues(),
    getEarnedBadges(),
  ]);
  const displayName = profile?.display_name ?? (isAnonymous ? "Guest" : "Player");

  return (
    <main className="mx-auto max-w-md space-y-6 p-6">
      <header>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">YOUR LEAGUES</p>
        <h1 className="text-2xl font-black">Hi, {displayName}</h1>
      </header>

      <BadgeStrip earned={badges} />

      {isAnonymous && (
        <Link href="/login" className="block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center text-sm text-white/60">
            You&apos;re playing as a guest — <span className="font-semibold text-[var(--bn-gold)]">sign in to save your picks &amp; leagues</span>
          </div>
        </Link>
      )}

      <section className="space-y-3">
        {leagues.map((l) => (
          <Link key={l.id} href={`/leagues/${l.id}`} className="block">
            <Card className="flex items-center justify-between transition-colors hover:bg-white/[0.06]">
              <div>
                <p className="font-bold">{l.name}</p>
                {l.is_global ? (
                  <p className="text-xs text-white/45">Everyone&apos;s leaderboard</p>
                ) : (
                  <p className="text-xs text-white/50">
                    Share code <span className="font-mono font-bold text-[var(--bn-gold)]">{l.invite_code}</span> to invite friends
                  </p>
                )}
              </div>
              <span className="text-white/40">›</span>
            </Card>
          </Link>
        ))}
      </section>

      <Card className="space-y-3">
        <h2 className="font-bold">👥 Start a league with friends</h2>
        <p className="text-xs text-white/50">Create one, then share the invite code so friends can join and compete.</p>
        <form action={createLeagueForm} className="flex gap-2">
          <Input name="name" placeholder="League name" required />
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Join a friend&apos;s league</h2>
        <form action={joinLeagueForm} className="flex gap-2">
          <Input name="code" placeholder="Invite code" className="font-mono uppercase" required />
          <Button type="submit" variant="ghost">Join</Button>
        </form>
      </Card>
    </main>
  );
}
