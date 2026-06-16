import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupsForPrediction } from "@/lib/predictions/queries";
import { PredictClient } from "./predict-client";

export default async function PredictPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Sign-in is optional; the proxy auto-creates an anonymous session. If one
  // genuinely isn't available, send to the welcome rather than a login wall.
  if (!user) redirect("/");

  const groups = await getGroupsForPrediction();
  if (groups.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="mt-3 text-2xl font-black">Groups aren&apos;t loaded yet</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          The tournament data hasn&apos;t been imported. Once the groups are in, you can predict every match here.
        </p>
        <p className="mt-4 text-xs text-white/30">Admin: run <code className="text-[var(--bn-gold)]">npm run ingest:wc</code></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <PredictClient groups={groups} userId={user.id} />
    </main>
  );
}
