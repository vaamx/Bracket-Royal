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
      <main className="mx-auto max-w-md p-6">
        <p className="text-white/60">No groups are loaded yet. Run <code className="text-[var(--bn-gold)]">npm run seed</code>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <PredictClient groups={groups} userId={user.id} />
    </main>
  );
}
