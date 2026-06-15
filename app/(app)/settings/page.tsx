import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data: prefs } = await supabase
    .from("notification_prefs").select("push_enabled, email_enabled, email").eq("user_id", user.id).maybeSingle();

  return (
    <main className="mx-auto max-w-md p-6 space-y-5">
      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">SETTINGS</p>
        <h1 className="text-2xl font-black">Notifications</h1>
      </div>
      <SettingsClient
        userId={user.id}
        initialPush={prefs?.push_enabled ?? false}
        initialEmail={prefs?.email_enabled ?? false}
        initialAddr={prefs?.email ?? null}
      />
    </main>
  );
}
