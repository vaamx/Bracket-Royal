import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(app)/leagues/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const isAnon = user.is_anonymous === true;
  const { data: prefs } = await supabase
    .from("notification_prefs").select("push_enabled, email_enabled, email").eq("user_id", user.id).maybeSingle();

  let name = "Guest";
  if (!isAnon) {
    const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
    name = profile?.display_name ?? "Player";
  }
  const subtitle = isAnon ? "Playing as a guest" : user.email ?? "Signed in";

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">ACCOUNT</p>
        <h1 className="text-2xl font-black">Settings</h1>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={"grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-black " + (isAnon ? "bg-white/10 text-white/70" : "bg-[var(--bn-gold)]/20 text-[var(--bn-gold)]")}>
            {isAnon ? "👤" : name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-xs text-white/45">{subtitle}</p>
          </div>
        </div>
        {isAnon ? (
          <>
            <p className="text-sm text-white/60">Sign in to save your picks across devices and compete in private leagues.</p>
            <Link href="/login"><Button className="w-full">Sign in / Create account</Button></Link>
          </>
        ) : (
          <form action={signOut}>
            <Button variant="ghost" className="w-full">Sign out</Button>
          </form>
        )}
      </Card>

      <SettingsClient
        userId={user.id}
        initialPush={prefs?.push_enabled ?? false}
        initialEmail={prefs?.email_enabled ?? false}
        initialAddr={prefs?.email ?? null}
      />

      <Card>
        <a href="/api/calendar" className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-xl" aria-hidden>📅</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Add to your calendar</p>
            <p className="text-xs text-white/45">Match deadlines as calendar events</p>
          </div>
          <span className="text-white/40">›</span>
        </a>
      </Card>
    </main>
  );
}
