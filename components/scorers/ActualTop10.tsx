import Link from "next/link";
import type { PlayerLite } from "@/lib/players/queries";
import type { Dictionary } from "@/lib/i18n";

const MEDALS = ["🥇", "🥈", "🥉"];

export function ActualTop10({ rows, t }: { rows: PlayerLite[]; t: Dictionary }) {
  if (rows.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/50">{t.scorers.noActualYet}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((p, i) => (
        <li key={p.id} className={"flex items-center justify-between rounded-xl border px-4 py-2.5 " + (i < 3 ? "border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/[0.05]" : "border-white/10 bg-white/[0.03]")}>
          <Link href={`/players/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80">
            <span className="grid w-6 shrink-0 place-items-center text-center text-base font-extrabold text-[var(--bn-gold)]">{MEDALS[i] ?? i + 1}</span>
            <span className="text-lg" aria-hidden>{p.flag ?? "🏳️"}</span>
            <span className="truncate text-sm font-semibold">{p.name}</span>
          </Link>
          <span className="ml-2 flex shrink-0 items-baseline gap-1">
            <span className="text-base font-black tabular-nums text-[var(--bn-gold)]">{p.goals}</span>
            <span className="text-[10px] font-bold uppercase text-white/35">{t.scorers.goals(p.goals).replace(/^\d+\s*/, "")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
