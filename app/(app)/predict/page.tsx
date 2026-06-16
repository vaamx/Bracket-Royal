import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupsForPrediction } from "@/lib/predictions/queries";
import { getT } from "@/lib/i18n";
import { PredictClient } from "./predict-client";

export default async function PredictPage() {
  const supabase = await createClient();
  const { t } = await getT();
  const { data: { user } } = await supabase.auth.getUser();
  // Sign-in is optional; the proxy auto-creates an anonymous session. If one
  // genuinely isn't available, send to the welcome rather than a login wall.
  if (!user) redirect("/");

  const groups = await getGroupsForPrediction();
  if (groups.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="mt-3 text-2xl font-black">{t.predict.notLoadedTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">{t.predict.notLoadedBody}</p>
        <p className="mt-4 text-xs text-white/30">{t.predict.adminRun} <code className="text-[var(--bn-gold)]">npm run ingest:wc</code></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <PredictClient groups={groups} userId={user.id} />
    </main>
  );
}
