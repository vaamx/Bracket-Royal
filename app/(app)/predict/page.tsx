import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroupsForPrediction } from "@/lib/predictions/queries";
import { PredictClient } from "./predict-client";

export default async function PredictPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
