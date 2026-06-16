"use client";

import { ScoreInput } from "@/components/predict/ScoreInput";
import { KickoffTime } from "@/components/predict/KickoffTime";
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

  // Who's your pick leading? (only for not-yet-played matches you've predicted)
  const lead: "home" | "away" | "draw" | null =
    !final && predicted
      ? match.predictedHome! > match.predictedAway!
        ? "home"
        : match.predictedAway! > match.predictedHome!
        ? "away"
        : "draw"
      : null;

  let verdict: "exact" | "result" | "miss" | null = null;
  if (final && predicted) {
    const exact = match.predictedHome === match.homeScore && match.predictedAway === match.awayScore;
    const sameOutcome =
      outcomeOf(match.predictedHome as number, match.predictedAway as number) ===
      outcomeOf(match.homeScore as number, match.awayScore as number);
    verdict = exact ? "exact" : sameOutcome ? "result" : "miss";
  }

  const teamCls = (side: "home" | "away") =>
    "min-w-0 flex-1 truncate text-sm " +
    (lead === side ? "font-extrabold text-[var(--bn-gold)]" : "font-semibold text-white/85");

  return (
    <div
      className={
        "rounded-2xl border px-3 py-3 transition-colors " +
        (final
          ? "border-white/10 bg-white/[0.02]"
          : predicted
          ? "border-[var(--bn-gold)]/30 bg-[var(--bn-gold)]/[0.04]"
          : "border-white/10 bg-white/[0.02]")
      }
    >
      {/* Kickoff + status meta */}
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-white/35">
        <span className="flex items-center gap-1.5">
          <KickoffTime iso={match.kickoffAt} />
        </span>
        {match.status === "live" ? (
          <span className="flex items-center gap-1 text-red-400">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> Live
          </span>
        ) : !final && locked ? (
          <span className="text-white/40">🔒 Locked</span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {/* Home */}
        <span className="flex w-[34%] items-center justify-end gap-1.5">
          <span className={teamCls("home") + " text-right"}>{home.name}</span>
          <span className="text-lg" aria-hidden>{home.flag}</span>
        </span>

        {/* Scores */}
        <div className="flex shrink-0 items-center gap-1.5">
          <ScoreInput
            value={final ? match.homeScore : match.predictedHome}
            onChange={(v) => onScore("home", v)}
            disabled={locked}
            highlight={lead === "home"}
            aria-label={`${home.name} score`}
          />
          <span className="text-white/25">:</span>
          <ScoreInput
            value={final ? match.awayScore : match.predictedAway}
            onChange={(v) => onScore("away", v)}
            disabled={locked}
            highlight={lead === "away"}
            aria-label={`${away.name} score`}
          />
        </div>

        {/* Away */}
        <span className="flex w-[34%] items-center gap-1.5">
          <span className="text-lg" aria-hidden>{away.flag}</span>
          <span className={teamCls("away")}>{away.name}</span>
        </span>
      </div>

      {lead === "draw" && (
        <p className="mt-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-white/40">Draw</p>
      )}

      {final && (
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
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
