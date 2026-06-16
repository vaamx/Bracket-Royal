"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { buildBracketView } from "@/lib/bracket/userBracket";
import { stageMatchIds } from "@/lib/bracket/structure";
import { TieCard } from "@/components/bracket/TieCard";
import { RoundStepper } from "@/components/bracket/RoundStepper";
import type { BracketData } from "@/lib/bracket/queries";
import { useCelebration } from "@/lib/celebrate/useCelebration";

type Stage = BracketData["matches"][number]["stage"];
type SaveStatus = "idle" | "saving" | "saved" | "error";

const ROUNDS: Array<{ stage: Stage; label: string; tab: string; tie: string }> = [
  { stage: "r32", label: "Round of 32", tab: "R32", tie: "Round of 32" },
  { stage: "r16", label: "Round of 16", tab: "R16", tie: "Round of 16" },
  { stage: "qf", label: "Quarterfinals", tab: "QF", tie: "Quarterfinal" },
  { stage: "sf", label: "Semifinals", tab: "SF", tie: "Semifinal" },
  { stage: "final", label: "The Final", tab: "🏆", tie: "Final" },
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

  const roundCounts = useMemo(() => {
    const out: Record<string, { done: number; total: number }> = {};
    for (const rr of ROUNDS) {
      const ids = stageMatchIds(rr.stage);
      out[rr.stage] = { done: ids.filter((id) => validPicks[id] !== undefined).length, total: ids.length };
    }
    return out;
  }, [validPicks]);

  const totalDone = useMemo(() => Object.values(roundCounts).reduce((a, c) => a + c.done, 0), [roundCounts]);
  const totalTies = useMemo(() => Object.values(roundCounts).reduce((a, c) => a + c.total, 0), [roundCounts]);

  function onPick(matchId: string, teamId: string) {
    if (!data.userId) return;
    const base = picksRef.current;
    const { validPicks: pruned } = buildBracketView(data.r32, { ...base, [matchId]: teamId });
    picksRef.current = pruned;
    setPicks(pruned);
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
        if (matchId === "F-1") celebrate("big"); // celebrate only after the pick is saved
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

  const roundDone = roundCounts[r.stage]?.done ?? 0;
  const roundTotal = roundCounts[r.stage]?.total ?? 0;

  return (
    <div className="space-y-4">
      {/* Overall progress */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold tracking-[2px] text-[var(--bn-accent)]">YOUR BRACKET</span>
          <span className="font-bold text-white/60">{totalDone}/{totalTies} ties called</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--bn-gold)] to-[var(--bn-gold-bright)]"
            initial={false}
            animate={{ width: `${totalTies ? (totalDone / totalTies) * 100 : 0}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      <RoundStepper rounds={STEPPER_ROUNDS} active={round} counts={roundCounts} onSelect={setRound} />

      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black">{r.label}</h1>
        <span className="pb-1 text-xs font-bold text-white/45">{roundDone}/{roundTotal} picked</span>
      </div>

      {r.stage === "final" && champion ? (
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl border border-[var(--bn-gold)]/50 bg-gradient-to-b from-[var(--bn-gold)]/20 to-transparent p-5 text-center shadow-[0_0_40px_-16px_rgba(212,175,55,0.8)]"
        >
          <div className="text-4xl">🏆</div>
          <p className="mt-1 text-xs font-bold uppercase tracking-[2px] text-white/60">Your champion</p>
          <p className="text-2xl font-black text-[var(--bn-gold)]">
            {data.teams[champion]?.flag} {data.teams[champion]?.name ?? champion}
          </p>
        </motion.div>
      ) : (
        <p className="text-xs text-white/45">Tap the team you think advances. Winners flow into the next round automatically.</p>
      )}

      <div className="space-y-3">
        {matchIds.map((id, i) => {
          const v = view[id] ?? {};
          return (
            <TieCard
              key={id}
              label={r.stage === "final" ? "Final" : `${r.tie} · ${i + 1}`}
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

      <div className="flex items-center justify-between pt-1">
        <button disabled={round === 0} onClick={() => setRound((x) => Math.max(0, x - 1))} className="rounded-full px-4 py-2 text-sm font-semibold text-white/50 disabled:opacity-30">← Back</button>
        <span className={"text-xs " + (status === "error" ? "text-red-400" : "text-white/40")}>{statusLabel}</span>
        <button disabled={round === ROUNDS.length - 1} onClick={() => setRound((x) => Math.min(ROUNDS.length - 1, x + 1))} className="rounded-full bg-[var(--bn-gold)]/15 px-4 py-2 text-sm font-bold text-[var(--bn-gold)] disabled:opacity-30">Next →</button>
      </div>
    </div>
  );
}
