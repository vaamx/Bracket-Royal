"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { buildBracketView } from "@/lib/bracket/userBracket";
import { stageMatchIds } from "@/lib/bracket/structure";
import { TieCard } from "@/components/bracket/TieCard";
import { RoundStepper } from "@/components/bracket/RoundStepper";
import { BracketTree } from "@/components/bracket/BracketTree";
import { ShareBracket } from "@/components/bracket/ShareBracket";
import type { BracketData } from "@/lib/bracket/queries";
import { useCelebration } from "@/lib/celebrate/useCelebration";
import { useI18n } from "@/lib/i18n/provider";

type Stage = BracketData["matches"][number]["stage"];
type SaveStatus = "idle" | "saving" | "saved" | "error";
type ViewMode = "tree" | "list";

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
  const { t } = useI18n();
  const roundLabel: Record<Stage, string> = {
    r32: t.bracket.roundOf32, r16: t.bracket.roundOf16, qf: t.bracket.quarterfinals,
    sf: t.bracket.semifinals, final: t.bracket.theFinal, third: t.bracket.final,
  };
  const tieLabel: Record<Stage, string> = {
    r32: t.bracket.roundOf32, r16: t.bracket.roundOf16, qf: t.bracket.quarterfinal,
    sf: t.bracket.semifinal, final: t.bracket.final, third: t.bracket.final,
  };
  const [picks, setPicks] = useState<Record<string, string>>(data.picks);
  const [round, setRound] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const locks = useMemo(() => lockedById(data.matches), [data.matches]);

  const [koScores, setKoScores] = useState<Record<string, { home: number | null; away: number | null }>>(data.scores);

  // Synchronous source of truth for the latest valid picks — so rapid taps build
  // on each other instead of a stale render snapshot.
  const picksRef = useRef<Record<string, string>>(data.picks);
  const koScoresRef = useRef(data.scores);
  const scoreTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
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

  // Upsert one KO tie's full prediction: who advances + the optional 90' scoreline.
  // Reads the latest winner/score from refs so concurrent writes don't clobber.
  function upsertTie(userId: string, matchId: string) {
    const sc = koScoresRef.current[matchId] ?? { home: null, away: null };
    return supabase.from("predictions").upsert(
      {
        user_id: userId,
        match_id: matchId,
        predicted_winner_team_id: picksRef.current[matchId] ?? null,
        predicted_home: sc.home,
        predicted_away: sc.away,
      },
      { onConflict: "user_id,match_id" }
    );
  }

  function onPick(matchId: string, teamId: string) {
    if (!data.userId) return;
    const base = picksRef.current;
    const { validPicks: pruned } = buildBracketView(data.r32, { ...base, [matchId]: teamId });
    picksRef.current = pruned;
    setPicks(pruned);
    setStatus("saving");

    // Picks orphaned by this change (their tie's teams changed) — drop their rows
    // and any stale scoreline with them.
    const removed = Object.keys(base).filter((id) => id !== matchId && !(id in pruned));
    if (removed.length > 0) {
      const nextScores = { ...koScoresRef.current };
      for (const id of removed) delete nextScores[id];
      koScoresRef.current = nextScores;
      setKoScores(nextScores);
    }

    const userId = data.userId;
    saveChain.current = saveChain.current.then(async () => {
      try {
        const { error: upErr } = await upsertTie(userId, matchId);
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

  function onScore(matchId: string, side: "home" | "away", value: number | null) {
    if (!data.userId) return;
    const cur = koScoresRef.current[matchId] ?? { home: null, away: null };
    const next = { ...koScoresRef.current, [matchId]: { ...cur, [side]: value } };
    koScoresRef.current = next;
    setKoScores(next);
    setStatus("saving");
    const userId = data.userId;
    clearTimeout(scoreTimers.current[matchId]);
    scoreTimers.current[matchId] = setTimeout(() => {
      saveChain.current = saveChain.current.then(async () => {
        try {
          const { error } = await upsertTie(userId, matchId);
          if (error) throw error;
          setStatus("saved");
        } catch (e) {
          console.error("Failed to save bracket score", matchId, e);
          setStatus("error");
        }
      });
    }, 600);
  }

  const r = ROUNDS[round];
  const matchIds = stageMatchIds(r.stage);
  const champion = view["F-1"]?.pick;

  const statusLabel = status === "saving" ? t.common.saving : status === "error" ? t.common.saveFailed : status === "saved" ? t.common.savedAll : "";

  const roundDone = roundCounts[r.stage]?.done ?? 0;
  const roundTotal = roundCounts[r.stage]?.total ?? 0;

  const seeded = data.seeded;
  const effectiveMode: ViewMode = seeded ? viewMode : "tree";
  const groupsPct = data.groupsTotal ? (data.groupsReady / data.groupsTotal) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Overall progress + view toggle */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold tracking-[2px] text-[var(--bn-accent)]">{t.bracket.yourBracket}</span>
          <span className="font-bold text-white/60">
            {seeded ? t.bracket.tiesCalled(totalDone, totalTies) : t.bracket.groupsShort(data.groupsReady, data.groupsTotal)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-[var(--bn-gold)] to-[var(--bn-gold-bright)]"
            initial={false}
            animate={{ width: `${seeded ? (totalTies ? (totalDone / totalTies) * 100 : 0) : groupsPct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        {seeded && (
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-black/30 p-1">
            {(["tree", "list"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={
                  "rounded-full py-1.5 text-xs font-bold transition-colors " +
                  (viewMode === m ? "bg-[var(--bn-gold)] text-[#0a1428]" : "text-white/55")
                }
              >
                {m === "tree" ? t.bracket.tabBracket : t.bracket.tabRoundByRound}
              </button>
            ))}
          </div>
        )}
      </div>

      {!seeded && (
        <div className="rounded-2xl border border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/[0.07] p-4">
          <p className="text-center text-sm font-bold text-white">{t.bracket.howTitle}</p>
          <ol className="mt-3 space-y-2 text-sm text-white/75">
            {[t.bracket.howStep1, t.bracket.howStep2, t.bracket.howStep3].map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--bn-gold)] text-[11px] font-black text-[#0a1428]">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <Link
            href="/predict"
            className="mt-4 block rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-5 py-2.5 text-center text-sm font-extrabold text-[#0a1428]"
          >
            {data.groupsReady > 0 ? t.bracket.finishPicks(data.groupsReady, data.groupsTotal) : t.bracket.startPredicting}
          </Link>
        </div>
      )}

      {seeded && champion && (() => {
        const finalView = view["F-1"];
        const runnerUpId = finalView?.homeTeamId === champion ? finalView?.awayTeamId : finalView?.homeTeamId;
        return (
          <ShareBracket
            championName={data.teams[champion]?.name ?? champion}
            championFlag={data.teams[champion]?.flag ?? ""}
            runnerUpName={runnerUpId ? data.teams[runnerUpId]?.name : undefined}
            runnerUpFlag={runnerUpId ? data.teams[runnerUpId]?.flag ?? "" : undefined}
          />
        );
      })()}

      {effectiveMode === "tree" ? (
        <>
          {seeded && <p className="text-xs text-white/45">{t.bracket.tapHintTree}</p>}
          <BracketTree view={view} teams={data.teams} locks={locks} onPick={onPick} />
          <p className={"text-center text-xs " + (status === "error" ? "text-red-400" : "text-white/40")}>{statusLabel}</p>
        </>
      ) : (
      <>
      <RoundStepper rounds={STEPPER_ROUNDS} active={round} counts={roundCounts} onSelect={setRound} />

      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-black">{roundLabel[r.stage]}</h1>
        <span className="pb-1 text-xs font-bold text-white/45">{t.predict.predicted(roundDone, roundTotal)}</span>
      </div>

      {r.stage === "final" && champion ? (
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl border border-[var(--bn-gold)]/50 bg-gradient-to-b from-[var(--bn-gold)]/20 to-transparent p-5 text-center shadow-[0_0_40px_-16px_rgba(212,175,55,0.8)]"
        >
          <div className="text-4xl">🏆</div>
          <p className="mt-1 text-xs font-bold uppercase tracking-[2px] text-white/60">{t.bracket.yourChampion}</p>
          <p className="text-2xl font-black text-[var(--bn-gold)]">
            {data.teams[champion]?.flag} {data.teams[champion]?.name ?? champion}
          </p>
        </motion.div>
      ) : (
        <p className="text-xs text-white/45">{t.bracket.scoreHint}</p>
      )}

      <div className="space-y-3">
        {matchIds.map((id, i) => {
          const v = view[id] ?? {};
          return (
            <TieCard
              key={id}
              label={r.stage === "final" ? t.bracket.final : `${tieLabel[r.stage]} · ${i + 1}`}
              home={v.homeTeamId}
              away={v.awayTeamId}
              homeTeam={v.homeTeamId ? data.teams[v.homeTeamId] : undefined}
              awayTeam={v.awayTeamId ? data.teams[v.awayTeamId] : undefined}
              pick={v.pick}
              locked={locks[id] ?? false}
              onPick={(teamId) => onPick(id, teamId)}
              homeScore={koScores[id]?.home}
              awayScore={koScores[id]?.away}
              onScore={(side, value) => onScore(id, side, value)}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button disabled={round === 0} onClick={() => setRound((x) => Math.max(0, x - 1))} className="rounded-full px-4 py-2 text-sm font-semibold text-white/50 disabled:opacity-30">← {t.common.back}</button>
        <span className={"text-xs " + (status === "error" ? "text-red-400" : "text-white/40")}>{statusLabel}</span>
        <button disabled={round === ROUNDS.length - 1} onClick={() => setRound((x) => Math.min(ROUNDS.length - 1, x + 1))} className="rounded-full bg-[var(--bn-gold)]/15 px-4 py-2 text-sm font-bold text-[var(--bn-gold)] disabled:opacity-30">{t.common.next} →</button>
      </div>
      </>
      )}
    </div>
  );
}
