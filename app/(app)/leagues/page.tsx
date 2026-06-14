import { getMyLeagues, getSessionProfile } from "@/lib/leagues/queries";
import { createLeague, joinLeague, signOut } from "./actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { redirect } from "next/navigation";

// Next 16 form `action` requires (formData: FormData) => void | Promise<void>.
// These wrappers discard the return value so the signature matches.
async function createLeagueAction(formData: FormData) { await createLeague(formData); }
async function joinLeagueAction(formData: FormData) { await joinLeague(formData); }

export default async function LeaguesPage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  const leagues = await getMyLeagues();

  return (
    <main className="mx-auto max-w-md p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">YOUR LEAGUES</p>
          <h1 className="text-2xl font-black">Hi, {profile.display_name}</h1>
        </div>
        <form action={signOut}>
          <Button variant="ghost">Sign out</Button>
        </form>
      </header>

      <section className="space-y-3">
        {leagues.map((l) => (
          <Card key={l.id} className="flex items-center justify-between">
            <div>
              <p className="font-bold">{l.name}</p>
              {!l.is_global && (
                <p className="text-xs text-white/50">Invite code: <span className="font-mono text-[var(--bn-gold)]">{l.invite_code}</span></p>
              )}
            </div>
            {l.is_global && <span className="text-xs text-white/50">Everyone</span>}
          </Card>
        ))}
      </section>

      <Card className="space-y-3">
        <h2 className="font-bold">Create a league</h2>
        <form action={createLeagueAction} className="flex gap-2">
          <Input name="name" placeholder="League name" required />
          <Button type="submit">Create</Button>
        </form>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Join a league</h2>
        <form action={joinLeagueAction} className="flex gap-2">
          <Input name="code" placeholder="Invite code" className="font-mono uppercase" required />
          <Button type="submit" variant="ghost">Join</Button>
        </form>
      </Card>
    </main>
  );
}
