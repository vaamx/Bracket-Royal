"use client";
import { useEffect, useRef, useState } from "react";
import { searchPlayersAction } from "@/lib/players/search-action";
import type { PlayerLite } from "@/lib/players/queries";
import { useI18n } from "@/lib/i18n/provider";

export function PlayerSearch({ contenders, chosenIds, onAdd }: { contenders: PlayerLite[]; chosenIds: Set<string>; onAdd: (id: string) => void; }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerLite[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => setResults(await searchPlayersAction(q)), 250);
  }, [q]);
  const Chip = ({ p }: { p: PlayerLite }) => (
    <button onClick={() => onAdd(p.id)} disabled={chosenIds.has(p.id)} className="flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-xs font-bold disabled:opacity-30">
      <span aria-hidden>{p.flag ?? "🏳️"}</span><span className="max-w-[120px] truncate">{p.name}</span><span className="text-[var(--bn-gold)]">+</span>
    </button>
  );
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.scorers.searchPlaceholder}
        className="h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm outline-none focus:border-[var(--bn-gold)]" />
      {results.length > 0 && <div className="flex flex-wrap gap-2">{results.map((p) => <Chip key={p.id} p={p} />)}</div>}
      {q.trim().length < 2 && (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.contenders}</p>
          <div className="flex flex-wrap gap-2">{contenders.map((p) => <Chip key={p.id} p={p} />)}</div>
        </div>
      )}
    </div>
  );
}
