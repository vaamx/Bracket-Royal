import type { PlayerLite } from "@/lib/players/queries";
import type { Dictionary } from "@/lib/i18n";

export function ActualTop10({ rows, t }: { rows: PlayerLite[]; t: Dictionary }) {
  if (rows.length === 0) return <p className="rounded-2xl border border-white/10 bg-white/[0.03] py-8 text-center text-sm text-white/50">{t.scorers.noActualYet}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((p, i) => (
        <li key={p.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
          <span className="flex items-center gap-3"><span className="w-5 text-center font-extrabold text-[var(--bn-gold)]">{i + 1}</span><span aria-hidden>{p.flag ?? "🏳️"}</span><span className="text-sm font-semibold">{p.name}</span></span>
          <span className="text-sm font-black tabular-nums text-[var(--bn-gold)]">{p.goals}</span>
        </li>
      ))}
    </ul>
  );
}
