"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildBracketView } from "@/lib/bracket/userBracket";
import { stageMatchIds } from "@/lib/bracket/structure";
import { TieCard } from "@/components/bracket/TieCard";
import { RoundStepper } from "@/components/bracket/RoundStepper";
import type { BracketData } from "@/lib/bracket/queries";
import { useCelebration } from "@/lib/celebrate/useCelebration";

type Stage = BracketData["matches"][number]["stage"];
type SaveStatus = "idle" | "saving" | "saved" | "error";

const ROUNDS: Array<{ stage: Stage; label: string; tab: string }> = [
  { stage: "r32", label: "Round of 32", tab: "R32" },
  { stage: "r16", label: "Round of 16", tab: "R16" },
  { stage: "qf", label: "Quarterfinals", tab: "QF" },
  { stage: "sf", label: "Semifinals", tab: "SF" },
  { stage: "final", label: "Final", tab: "F" },
];
const STEPPER_ROUNDS = ROUNDS.map((x) => ({ stage: x.stage, label: x.tab }));

function lockedById(matches: BracketData["matches"]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of matches) {
    out[m.id] = m.status === "final" || m.status === "live" || (m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now());
  }
  return out;
}

export function BracketClient({ data }: { data: BracketData }) {
  const supabase = useMemo(() => createClient(), []);
  const celebrate = useCelebration();
  const [picks, setPicks] = useState<Record<string, string>>(data.picks);
  const [round, setRound] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const locks = useMemo(() => lockedById(data.matches), [data.matches]);

  // Synchronous source of truth for the latest valid picks — so rapid taps build
  // on each other instead of a stale render snapshot.
  const picksRef = useRef<Record<string, string>>(data.picks);
  // Serialize DB writes so a later pick's delete can't race a prior upsert.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const { view, validPicks } = useMemo(() => buildBracketView(data.r32, picks), [data.r32, picks]);

  const completedRounds = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const rr of ROUNDS) out[rr.stage] = stageMatchIds(rr.stage).every((id) => validPicks[id] !== undefined);
    return out;
  }, [validPicks]);

  function onPick(matchId: string, teamId: string) {
    if (!data.userId) return;
    const base = picksRef.current;
    const { validPicks: pruned } = buildBracketView(data.r32, { ...base, [matchId]: teamId });
    picksRef.current = pruned;
    setPicks(pruned);
    if (matchId === "F-1") celebrate("big");
    setStatus("saving");

    const removed = Object.keys(base).filter((id) => id !== matchId && !(id in pruned));
    const userId = data.userId;
    saveChain.current = saveChain.current.then(async () => {
      try {
        const { error: upErr } = await supabase.from("predictions").upsert(
          { user_id: userId, match_id: matchId, predicted_winner_team_id: teamId },
          { onConflict: "user_id,match_id" }
        );
        if (upErr) throw upErr;
        if (removed.length > 0) {
          const { error: delErr } = await supabase.from("predictions").delete().eq("user_id", userId).in("match_id", removed);
          if (delErr) throw delErr;
        }
        setStatus("saved");
      } catch (e) {
        console.error("Failed to save bracket pick", matchId, e);
        setStatus("error");
      }
    });
  }

  const r = ROUNDS[round];
  const matchIds = stageMatchIds(r.stage);
  const champion = view["F-1"]?.pick;

  const statusLabel = status === "saving" ? "Saving…" : status === "error" ? "Couldn't save — check your connection" : status === "saved" ? "Saved" : "";

  return (
    <div className="space-y-5">
      <RoundStepper rounds={STEPPER_ROUNDS} active={round} completed={completedRounds} onSelect={setRound} />

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
        <span className={"text-xs " + (status === "error" ? "text-red-400" : "text-white/40")}>{statusLabel}</span>
        <button disabled={round === ROUNDS.length - 1} onClick={() => setRound((x) => Math.min(ROUNDS.length - 1, x + 1))} className="text-sm font-semibold text-[var(--bn-gold)] disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
