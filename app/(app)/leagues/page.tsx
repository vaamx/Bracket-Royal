import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyLeagues, getSessionProfile } from "@/lib/leagues/queries";
import { createLeagueForm, joinLeagueForm, signOut } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getEarnedBadges } from "@/lib/achievements/queries";
import { BadgeStrip } from "@/components/ui/BadgeStrip";

export default async function LeaguesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/"); // sign-in is optional; no session at all → welcome

  const isAnonymous = user.is_anonymous === true;
  const profile = await getSessionProfile();
  const leagues = await getMyLeagues();
  const badges = await getEarnedBadges();
  const displayName = profile?.display_name ?? (isAnonymous ? "Guest" : "Player");

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">YOUR LEAGUES</p>
          <h1 className="text-2xl font-black">Hi, {displayName}</h1>
        </div>
        {isAnonymous ? (
          <Link href="/login">
            <Button>Sign in</Button>
          </Link>
        ) : (
          <form action={signOut}>
            <Button variant="ghost">Sign out</Button>
          </form>
        )}
      </header>

      <BadgeStrip earned={badges} />

      {isAnonymous && (
        <Link href="/login" className="block">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center text-sm text-white/60">
            You&apos;re playing as a guest — <span className="font-semibold text-[var(--bn-gold)]">sign in to save your picks &amp; leagues</span>
          </div>
        </Link>
      )}

      <a href="/predict" className="block">
        <div className="rounded-2xl border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/10 p-4 text-center font-extrabold text-[var(--bn-gold)]">
          ⚽ Make your group predictions →
        </div>
      </a>

      <a href="/bracket" className="block">
        <div className="rounded-2xl border border-[var(--bn-accent)]/30 bg-[var(--bn-accent)]/10 p-4 text-center font-extrabold text-[var(--bn-accent)]">
          🗺️ Build your knockout bracket →
        </div>
      </a>

      <a href="/api/calendar" className="block text-center text-sm font-semibold text-white/50 hover:text-white/80">
        📅 Add match deadlines to your calendar
      </a>

      <section className="space-y-3">
        {leagues.map((l) => (
          <Link key={l.id} href={`/leagues/${l.id}`} className="block">
            <Card className="flex items-center justify-between transition-colors hover:bg-white/[0.06]">
              <div>
                <p className="font-bold">{l.name}</p>
                {!l.is_global && (
                  <p className="text-xs text-white/50">Invite code: <span className="font-mono text-[var(--bn-gold)]">{l.invite_code}</span></p>
                )}
              </div>
              <span className="text-white/40">›</span>
            </Card>
          </Link>
        ))}
      </section>

      <Card className="space-y-3">
        <h2 className="font-bold">Create a league</h2>
        <form action={createLeagueForm} className="flex gap-2">
          <Input name="name" placeholder="League name" required />
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Join a league</h2>
        <form action={joinLeagueForm} className="flex gap-2">
          <Input name="code" placeholder="Invite code" className="font-mono uppercase" required />
          <Button type="submit" variant="ghost">Join</Button>
        </form>
      </Card>
    </main>
  );
}
