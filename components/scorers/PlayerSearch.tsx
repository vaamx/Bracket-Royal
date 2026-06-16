"use client";
import { useEffect, useRef, useState } from "react";
import { searchPlayersAction } from "@/lib/players/search-action";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { PlayerLite } from "@/lib/players/queries";
import { useI18n } from "@/lib/i18n/provider";

export function PlayerSearch({ contenders, chosenIds, onAdd }: { contenders: PlayerLite[]; chosenIds: Set<string>; onAdd: (id: string) => void; }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerLite[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    timer.current = setTimeout(async () => { setResults(await searchPlayersAction(q)); setSearching(false); }, 250);
  }, [q]);

  const Row = ({ p }: { p: PlayerLite }) => {
    const chosen = chosenIds.has(p.id);
    return (
      <button
        onClick={() => onAdd(p.id)} disabled={chosen}
        className={"flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors " + (chosen ? "border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/[0.06]" : "border-white/10 bg-white/[0.03] hover:border-white/20 active:scale-[0.99]")}
      >
        <PlayerAvatar name={p.name} flag={p.flag} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{p.name}</span>
          <span className="block truncate text-[11px] text-white/45">
            {p.teamId ?? "—"}
            {p.scorerRank ? ` · #${p.scorerRank}` : ""}
            {p.goals > 0 ? ` · ⚽ ${t.scorers.goals(p.goals)}` : ""}
          </span>
        </span>
        <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-black " + (chosen ? "bg-[var(--bn-gold)]/20 text-[var(--bn-gold)]" : "bg-[var(--bn-gold)] text-[#0a1428]")} aria-hidden>
          {chosen ? "✓" : "+"}
        </span>
      </button>
    );
  };

  const searched = q.trim().length >= 2;
  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/35" aria-hidden>🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.scorers.searchPlaceholder}
          className="h-11 w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-sm outline-none focus:border-[var(--bn-gold)]" />
      </div>

      {searched ? (
        searching && results.length === 0 ? (
          <p className="px-1 py-2 text-xs text-white/40">{t.common.saving}</p>
        ) : results.length > 0 ? (
          <div className="space-y-2">{results.map((p) => <Row key={p.id} p={p} />)}</div>
        ) : (
          <p className="px-1 py-2 text-xs text-white/40">{t.scorers.noResults}</p>
        )
      ) : (
        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-white/40">{t.scorers.contenders}</p>
          <div className="space-y-2">{contenders.map((p) => <Row key={p.id} p={p} />)}</div>
        </div>
      )}
    </div>
  );
}
