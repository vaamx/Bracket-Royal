import { redirect } from "next/navigation";
import { getBracketData } from "@/lib/bracket/queries";
import { getT } from "@/lib/i18n";
import { BracketClient } from "./bracket-client";

export default async function BracketPage() {
  const data = await getBracketData();
  if (!data.userId) redirect("/");
  const { t } = await getT();

  if (!data.resolved) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="mt-3 text-2xl font-black">{t.bracket.notReadyTitle}</h1>
        <p className="mt-2 max-w-xs text-sm text-white/60">{t.bracket.notReadyBody}</p>
        <p className="mt-4 text-xs text-white/30">{t.bracket.adminRun} <code className="text-[var(--bn-gold)]">npm run ingest:wc</code></p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-24">
      <BracketClient data={data} />
    </main>
  );
}
