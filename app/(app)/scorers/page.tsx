import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getContenders, getMyScorerBoard, getActualTop10, scorersLocked } from "@/lib/players/queries";
import { getT } from "@/lib/i18n";
import { ActualTop10 } from "@/components/scorers/ActualTop10";
import { ScorersClient } from "./scorers-client";

export default async function ScorersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { t } = await getT();
  const [contenders, board, top10, locked] = await Promise.all([getContenders(), getMyScorerBoard(), getActualTop10(), scorersLocked()]);

  return (
    <main className="mx-auto max-w-md space-y-5 p-6 pb-24">
      <div>
        <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{t.scorers.eyebrow}</p>
        <h1 className="text-2xl font-black">🥇 {t.scorers.title}</h1>
        <p className="mt-1 text-sm text-white/60">{t.scorers.intro}</p>
        <p className="mt-1 text-xs text-white/40">{locked ? t.scorers.locked : t.scorers.lockHint}</p>
      </div>
      <ScorersClient contenders={contenders} initialPicks={board.picks} initialBootId={board.bootId} initialBootGoals={board.bootGoals} locked={locked} />
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.actualTop10}</p>
        <ActualTop10 rows={top10} t={t} />
      </div>
    </main>
  );
}
