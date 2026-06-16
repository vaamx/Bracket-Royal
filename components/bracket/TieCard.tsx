"use client";

import { motion } from "framer-motion";
import type { BracketTeam } from "@/lib/bracket/queries";
import { ScoreInput } from "@/components/predict/ScoreInput";
import { useI18n } from "@/lib/i18n/provider";

function TeamRow({
  teamId, team, picked, decided, locked, onPick,
}: {
  teamId?: string;
  team?: BracketTeam;
  picked: boolean;
  decided: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const empty = !teamId;
  const label = team?.name ?? "To be decided";
  const loser = decided && !picked;
  return (
    <motion.button
      type="button"
      disabled={locked || empty}
      onClick={onPick}
      whileTap={locked || empty ? undefined : { scale: 0.97 }}
      animate={{ opacity: loser ? 0.45 : 1 }}
      className={
        "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors " +
        (picked
          ? "bg-gradient-to-r from-[var(--bn-gold)]/25 to-[var(--bn-gold)]/5 text-white"
          : empty
          ? "text-white/30"
          : "text-white/85 hover:bg-white/[0.04]")
      }
    >
      <span
        className={
          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg " +
          (picked ? "bg-[var(--bn-gold)]/20 ring-1 ring-[var(--bn-gold)]/60" : "bg-white/5")
        }
        aria-hidden
      >
        {team?.flag ?? "🏳️"}
      </span>
      <span className={"truncate text-sm " + (picked ? "font-extrabold" : "font-semibold")}>{label}</span>
      {picked && (
        <motion.span
          layoutId={undefined}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="ml-auto rounded-full bg-[var(--bn-gold)] px-2 py-0.5 text-[10px] font-black tracking-wide text-[#0a1428]"
        >
          ADVANCES
        </motion.span>
      )}
    </motion.button>
  );
}

export function TieCard({
  home, away, homeTeam, awayTeam, pick, locked, label, onPick,
  homeScore, awayScore, onScore,
}: {
  home?: string;
  away?: string;
  homeTeam?: BracketTeam;
  awayTeam?: BracketTeam;
  pick?: string;
  locked: boolean;
  label?: string;
  onPick: (teamId: string) => void;
  homeScore?: number | null;
  awayScore?: number | null;
  onScore?: (side: "home" | "away", value: number | null) => void;
}) {
  const { t } = useI18n();
  const decided = pick !== undefined;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={
        "overflow-hidden rounded-2xl border bg-white/[0.02] " +
        (decided ? "border-[var(--bn-gold)]/40 shadow-[0_0_24px_-12px_rgba(212,175,55,0.6)]" : "border-white/10")
      }
    >
      {(label || locked) && (
        <div className="flex items-center justify-between px-4 pt-2.5 text-[10px] font-bold uppercase tracking-[1.5px] text-white/35">
          <span>{label}</span>
          {locked && <span className="text-white/40">🔒 Locked</span>}
        </div>
      )}
      <TeamRow
        teamId={home} team={homeTeam} picked={pick === home} decided={decided} locked={locked}
        onPick={() => home && onPick(home)}
      />
      <div className="relative flex items-center px-4">
        <div className="h-px flex-1 bg-white/10" />
        <span className="px-2 text-[10px] font-black text-white/25">VS</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <TeamRow
        teamId={away} team={awayTeam} picked={pick === away} decided={decided} locked={locked}
        onPick={() => away && onPick(away)}
      />

      {onScore && home && away && (
        <div className="border-t border-white/5 px-4 py-2.5">
          <p className="mb-1.5 text-center text-[10px] font-bold uppercase tracking-[1.5px] text-white/35">{t.bracket.predictedScore}</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-bold text-white/55">{home}</span>
            <ScoreInput value={homeScore ?? null} onChange={(v) => onScore("home", v)} disabled={locked} aria-label={`${homeTeam?.name ?? home} score`} />
            <span className="text-white/25">:</span>
            <ScoreInput value={awayScore ?? null} onChange={(v) => onScore("away", v)} disabled={locked} aria-label={`${awayTeam?.name ?? away} score`} />
            <span className="text-xs font-bold text-white/55">{away}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
