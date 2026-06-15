"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildBracketView } from "@/lib/bracket/userBracket";
import { TieCard } from "@/components/bracket/TieCard";
import { RoundStepper } from "@/components/bracket/RoundStepper";
import type { BracketData } from "@/lib/bracket/queries";

const ROUNDS: Array<{ stage: BracketData["matches"][number]["stage"]; label: string; prefix: string; count: number }> = [
  { stage: "r32", label: "Round of 32", prefix: "R32", count: 16 },
  { stage: "r16", label: "Round of 16", prefix: "R16", count: 8 },
  { stage: "qf", label: "Quarterfinals", prefix: "QF", count: 4 },
  { stage: "sf", label: "Semifinals", prefix: "SF", count: 2 },
  { stage: "final", label: "Final", prefix: "F", count: 1 },
];

function lockedById(matches: BracketData["matches"]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of matches) {
    out[m.id] = m.status === "final" || m.status === "live" || (m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now());
  }
  return out;
}

export function BracketClient({ data }: { data: BracketData }) {
  const supabase = useMemo(() => createClient(), []);
  const [picks, setPicks] = useState<Record<string, string>>(data.picks);
  const [round, setRound] = useState(0);
  const [saving, setSaving] = useState(false);
  const locks = useMemo(() => lockedById(data.matches), [data.matches]);

  const { view, validPicks } = useMemo(() => buildBracketView(data.r32, picks), [data.r32, picks]);

  async function onPick(matchId: string, teamId: string) {
    if (!data.userId) return;
    const next = { ...validPicks, [matchId]: teamId };
    const { validPicks: pruned } = buildBracketView(data.r32, next);
    setPicks(pruned);

    setSaving(true);
    // Upsert the new pick; delete any picks the change invalidated.
    await supabase.from("predictions").upsert(
      { user_id: data.userId, match_id: matchId, predicted_winner_team_id: teamId },
      { onConflict: "user_id,match_id" }
    );
    const removed = Object.keys(validPicks).filter((id) => id !== matchId && !(id in pruned));
    if (removed.length > 0) {
      await supabase.from("predictions").delete().eq("user_id", data.userId).in("match_id", removed);
    }
    setSaving(false);
  }

  const r = ROUNDS[round];
  const matchIds = Array.from({ length: r.count }, (_, i) => `${r.prefix}-${i + 1}`);
  const champion = view["F-1"]?.pick;

  const completedRounds: Record<string, boolean> = {};
  for (const rr of ROUNDS) {
    const ids = Array.from({ length: rr.count }, (_, i) => `${rr.prefix}-${i + 1}`);
    completedRounds[rr.stage] = ids.every((id) => validPicks[id] !== undefined);
  }

  return (
    <div className="space-y-5">
      <RoundStepper rounds={ROUNDS.map((x) => ({ stage: x.stage, label: x.prefix === "F" ? "F" : x.prefix }))} active={round} completed={completedRounds} onSelect={setRound} />

      <div>
        <p className="text-xs tracking-[2px] text-[var(--bn-accent)] font-bold">KNOCKOUT</p>
        <h1 className="text-2xl font-black">{r.label}</h1>
      </div>

      {r.stage === "final" && champion && (
        <div className="rounded-2xl border border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/10 p-4 text-center">
          <div className="text-3xl">🏆</div>
          <p className="mt-1 text-sm text-white/60">Your champion</p>
          <p className="text-xl font-black text-[var(--bn-gold)]">{data.teams[champion]?.name ?? champion}</p>
        </div>
      )}

      <div className="space-y-4">
        {matchIds.map((id) => {
          const v = view[id] ?? {};
          return (
            <TieCard
              key={id}
              home={v.homeTeamId}
              away={v.awayTeamId}
              homeTeam={v.homeTeamId ? data.teams[v.homeTeamId] : undefined}
              awayTeam={v.awayTeamId ? data.teams[v.awayTeamId] : undefined}
              pick={v.pick}
              locked={locks[id] ?? false}
              onPick={(teamId) => onPick(id, teamId)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button disabled={round === 0} onClick={() => setRound((x) => Math.max(0, x - 1))} className="text-sm font-semibold text-white/50 disabled:opacity-30">← Back</button>
        <span className="text-xs text-white/40">{saving ? "Saving…" : "Saved"}</span>
        <button disabled={round === ROUNDS.length - 1} onClick={() => setRound((x) => Math.min(ROUNDS.length - 1, x + 1))} className="text-sm font-semibold text-[var(--bn-gold)] disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
