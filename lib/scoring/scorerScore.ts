import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface ScorerScoreInput {
  picks: string[];
  goldenBootId: string | null;
  goldenBootPredictedGoals: number | null;
  actualTop10: string[];
  actualTopScorerIds: string[];
  bootActualGoals: number | null;
  /** Per-pick predicted goal tally (playerId -> goals), null/absent = no prediction. */
  pickPredictedGoals?: Record<string, number | null>;
  /** Actual tournament goals per player (playerId -> goals). Absent = 0. */
  actualGoalsByPlayer?: Record<string, number>;
  config: LeagueScoringConfig;
}

function intersectionCount(a: string[], b: string[]): number {
  const set = new Set(b);
  return new Set(a.filter((x) => set.has(x))).size;
}

export function scoreUserScorers(input: ScorerScoreInput): { points: number } {
  const { config: c } = input;
  let points = intersectionCount(input.picks, input.actualTop10) * c.scorer.hit;
  if (input.goldenBootId && input.actualTopScorerIds.includes(input.goldenBootId)) {
    points += c.scorer.boot;
  }
  if (
    input.goldenBootId &&
    input.goldenBootPredictedGoals != null &&
    input.bootActualGoals != null &&
    input.goldenBootPredictedGoals === input.bootActualGoals
  ) {
    points += c.scorer.bootExact;
  }
  // Per-pick goal accuracy: reward nailing (exact) or nearly nailing (±1) each
  // picked player's real goal tally. Applies to all of a user's Top-10 picks.
  const predGoals = input.pickPredictedGoals ?? {};
  const actualGoals = input.actualGoalsByPlayer ?? {};
  for (const id of new Set(input.picks)) {
    const pred = predGoals[id];
    if (pred == null) continue;
    const actual = actualGoals[id] ?? 0;
    const diff = Math.abs(pred - actual);
    if (diff === 0) points += c.scorer.goalsExact;
    else if (diff === 1) points += c.scorer.goalsClose;
  }
  return { points };
}
