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

  // Predicted mode, but the user hasn't picked anything yet — don't auto-fill the
  // bracket with FIFA-rank favorites they never chose. Send them to Predict first.
  if (!data.seeded) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="mt-3 text-2xl font-black">Build your bracket</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          Your knockout bracket fills in from <span className="font-semibold text-white">your group-stage predictions</span>.
          Call the group winners first and the Round of 32 builds itself.
        </p>
        <Link
          href="/predict"
          className="mt-6 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 py-3 text-sm font-extrabold text-[#0a1428]"
        >
          Predict the group stage →
        </Link>
        <p className="mt-3 text-xs text-white/40">0 of {data.groupMatchesTotal} group matches predicted</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      {data.mode === "predicted" && (
        <div className="mb-4 rounded-2xl border border-[var(--bn-accent)]/30 bg-[var(--bn-accent)]/10 p-3 text-center text-xs text-white/70">
          Seeded from <span className="font-bold text-[var(--bn-accent)]">your group predictions</span> ({data.groupPicksMade}/{data.groupMatchesTotal} picked).
          Tweak your group picks to change who qualifies — it&apos;ll lock to the real teams once the group stage ends.
        </div>
      )}
      <BracketClient data={data} />
    </main>
  );
}
