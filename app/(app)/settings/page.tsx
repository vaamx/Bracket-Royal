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

  return (
    <main className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">ACCOUNT</p>
        <h1 className="text-2xl font-black">Settings</h1>
      </div>

      <Card className="space-y-3">
        <h2 className="font-bold">Account</h2>
        {isAnon ? (
          <>
            <p className="text-sm text-white/60">You&apos;re playing as a guest. Sign in to save your picks across devices and compete in leagues.</p>
            <Link href="/login"><Button>Sign in / Create account</Button></Link>
          </>
        ) : (
          <form action={signOut}>
            <Button variant="ghost">Sign out</Button>
          </form>
        )}
      </Card>

      <SettingsClient
        userId={user.id}
        initialPush={prefs?.push_enabled ?? false}
        initialEmail={prefs?.email_enabled ?? false}
        initialAddr={prefs?.email ?? null}
      />

      <a href="/api/calendar" className="block text-center text-sm font-semibold text-white/50 hover:text-white/80">
        📅 Add match deadlines to your calendar
      </a>
    </main>
  );
}
