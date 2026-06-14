import type {
  Outcome,
  PredictedScore,
  GroupScoringConfig,
} from "@/lib/math/types";

export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

export function scorePrediction(
  predicted: PredictedScore,
  actual: PredictedScore,
  config: GroupScoringConfig
): number {
  const exact = predicted.home === actual.home && predicted.away === actual.away;
  if (exact) return config.exact;

  const sameOutcome =
    outcomeOf(predicted.home, predicted.away) === outcomeOf(actual.home, actual.away);
  if (!sameOutcome) return 0;

  const sameGoalDiff = predicted.home - predicted.away === actual.home - actual.away;
  if (sameGoalDiff && outcomeOf(actual.home, actual.away) !== "draw") {
    return config.goalDiff;
  }
  return config.outcome;
}
