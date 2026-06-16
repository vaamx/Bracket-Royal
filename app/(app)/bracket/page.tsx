import Link from "next/link";
import { redirect } from "next/navigation";
import { getBracketData } from "@/lib/bracket/queries";
import { BracketClient } from "./bracket-client";

export default async function BracketPage() {
  const data = await getBracketData();
  if (!data.userId) redirect("/");

  if (!data.resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="mt-3 text-2xl font-black">No groups loaded</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">Run <code className="text-[var(--bn-gold)]">npm run ingest:wc</code> to load the tournament.</p>
      </main>
    );
  }

  // Predicted mode, but not every group is predicted yet — don't auto-fill the
  // bracket with FIFA-rank guesses for groups the user hasn't called. The official
  // R32 needs all group standings, so unlock it once every group is complete.
  if (!data.seeded) {
    const pct = data.groupsTotal ? Math.round((data.groupsReady / data.groupsTotal) * 100) : 0;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="mt-3 text-2xl font-black">Build your bracket</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          Your Round of 32 is built from <span className="font-semibold text-white">your group predictions</span> — including
          where the best third-placed teams land. Finish calling <span className="font-semibold text-white">every group</span> to unlock it.
        </p>

        <div className="mt-6 w-full max-w-xs">
          <div className="flex items-center justify-between text-xs font-bold text-white/55">
            <span>Groups complete</span>
            <span>{data.groupsReady}/{data.groupsTotal}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <Link
          href="/predict"
          className="mt-6 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 py-3 text-sm font-extrabold text-[#0a1428]"
        >
          {data.groupsReady > 0 ? "Finish your group picks →" : "Predict the group stage →"}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      {data.mode === "predicted" && (
        <div className="mb-4 rounded-2xl border border-[var(--bn-accent)]/30 bg-[var(--bn-accent)]/10 p-3 text-center text-xs text-white/70">
          These are <span className="font-bold text-[var(--bn-accent)]">your predicted qualifiers</span> from the group stage.
          Tweak your group picks to change who advances — it&apos;ll lock to the real teams once the group stage ends.
        </div>
      )}
      <BracketClient data={data} />
    </main>
  );
}
