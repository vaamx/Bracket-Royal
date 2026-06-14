"use client";

import { ScoreInput } from "@/components/predict/ScoreInput";
import type { PredictMatch, PredictTeam } from "@/lib/predictions/types";

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
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-black/20 px-3 py-2">
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
