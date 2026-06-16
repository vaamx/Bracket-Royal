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
    <div className="rounded-xl bg-black/20 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="flex w-1/3 items-center gap-1.5 justify-end text-sm">
          <span className="truncate text-right">{home.name}</span>
          <span aria-hidden>{home.flag}</span>
        </span>
        <div className="flex items-center gap-1.5">
          {/* When final, the boxes show the REAL result (read-only); otherwise your editable pick. */}
          <ScoreInput
            value={final ? match.homeScore : match.predictedHome}
            onChange={(v) => onScore("home", v)}
            disabled={locked}
            aria-label={`${home.name} score`}
          />
          <span className="text-white/30">:</span>
          <ScoreInput
            value={final ? match.awayScore : match.predictedAway}
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

      {final && (
        <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px]">
          <span className="rounded bg-white/5 px-1.5 py-0.5 font-bold text-white/50">FULL TIME</span>
          {predicted ? (
            <>
              <span className="text-white/45">
                your pick <span className="font-bold tabular-nums text-white/75">{match.predictedHome}–{match.predictedAway}</span>
              </span>
              <span
                className={
                  "font-extrabold " +
                  (verdict === "exact" ? "text-[var(--bn-gold)]" : verdict === "result" ? "text-[var(--bn-success)]" : "text-red-400")
                }
              >
                {verdict === "exact" ? "🎯 exact +5" : verdict === "result" ? "✓ right result +2" : "✗ missed"}
              </span>
            </>
          ) : (
            <span className="text-white/30">you didn&apos;t predict this one</span>
          )}
        </div>
      )}
    </div>
  );
}
