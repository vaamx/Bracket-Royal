import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface ScorerScoreInput {
  picks: string[];
  goldenBootId: string | null;
  goldenBootPredictedGoals: number | null;
  actualTop10: string[];
  actualTopScorerIds: string[];
  bootActualGoals: number | null;
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
  return { points };
}
