import { redirect } from "next/navigation";
import { getBracketData } from "@/lib/bracket/queries";
import { BracketClient } from "./bracket-client";

export default async function BracketPage() {
  const data = await getBracketData();
  if (!data.userId) redirect("/");

  if (!data.resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-3 text-2xl font-black">Bracket locked</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">
          Your knockout bracket unlocks once the group stage finishes and the Round of 32 is set. Keep predicting groups in the meantime.
        </p>
        <a href="/predict" className="mt-6 inline-flex h-12 items-center rounded-2xl bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-6 font-black text-[#0a1428]">
          Predict groups →
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <BracketClient data={data} />
    </main>
  );
}
