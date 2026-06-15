"use client";

import { ScoreInput } from "@/components/predict/ScoreInput";
import type { PredictMatch, PredictTeam } from "@/lib/predictions/types";
import { outcomeOf } from "@/lib/math";

export function MatchRow({
  match,
  home,
  away,
  locked,
  onScore,
}: {
  match: PredictMatch;
  home: PredictTeam;
  away: PredictTeam;
  locked: boolean;
  onScore: (side: "home" | "away", value: number | null) => void;
}) {
  const showResult = match.status === "final" && match.homeScore !== null;

  const final = match.status === "final" && match.homeScore !== null && match.awayScore !== null;
  const predicted = match.predictedHome !== null && match.predictedAway !== null;
  let verdict: "exact" | "result" | "miss" | null = null;
  if (final && predicted) {
    const exact = match.predictedHome === match.homeScore && match.predictedAway === match.awayScore;
    const sameOutcome =
      outcomeOf(match.predictedHome as number, match.predictedAway as number) ===
      outcomeOf(match.homeScore as number, match.awayScore as number);
    verdict = exact ? "exact" : sameOutcome ? "result" : "miss";
  }

  return (
    <div className="relative flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2">
      {verdict && (
        <span
          className={
            "absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-extrabold " +
            (verdict === "exact"
              ? "bg-[var(--bn-gold)] text-[#0a1428]"
              : verdict === "result"
              ? "bg-[var(--bn-success)]/20 text-[var(--bn-success)]"
              : "bg-red-500/20 text-red-400")
          }
        >
          {verdict === "exact" ? "🎯 EXACT" : verdict === "result" ? "✓" : "✗"}
        </span>
      )}
      <span className="flex w-1/3 items-center gap-1.5 justify-end text-sm">
        <span className="truncate text-right">{home.name}</span>
        <span aria-hidden>{home.flag}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <ScoreInput
          value={showResult ? match.homeScore : match.predictedHome}
          onChange={(v) => onScore("home", v)}
          disabled={locked}
          aria-label={`${home.name} score`}
        />
        <span className="text-white/30">:</span>
        <ScoreInput
          value={showResult ? match.awayScore : match.predictedAway}
          onChange={(v) => onScore("away", v)}
          disabled={locked}
          aria-label={`${away.name} score`}
        />
      </div>
      <span className="flex w-1/3 items-center gap-1.5 text-sm">
        <span aria-hidden>{away.flag}</span>
        <span className="truncate">{away.name}</span>
      </span>
    </div>
  );
}
