import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface StageSets {
  r32: string[];
  r16: string[];
  qf: string[];
  sf: string[];
  final: string[]; // the champion (final winner)
}

export interface KnockoutScoreInput {
  predictedWinnersByStage: StageSets;
  actualWinnersByStage: StageSets;
  predictedThirds: string[]; // user's predicted best-8 third-place teams
  actualThirds: string[];    // actual best-8 third-place teams
  config: LeagueScoringConfig;
}

function intersectionCount(a: string[], b: string[]): number {
  const set = new Set(b);
  return a.filter((x) => set.has(x)).length;
}

/**
 * Score one user's knockout stage. Per round, award round points for each team
 * the user correctly had advancing (set intersection — robust to bracket
 * divergence). The "final" set is the champion. Plus best-third bonus.
 */
export function scoreUserKnockout(input: KnockoutScoreInput): { points: number } {
  const { predictedWinnersByStage: p, actualWinnersByStage: a, config } = input;
  let points = 0;
  points += intersectionCount(p.r32, a.r32) * config.ko.r32;
  points += intersectionCount(p.r16, a.r16) * config.ko.r16;
  points += intersectionCount(p.qf, a.qf) * config.ko.qf;
  points += intersectionCount(p.sf, a.sf) * config.ko.sf;
  points += intersectionCount(p.final, a.final) * config.ko.champion;
  points += intersectionCount(input.predictedThirds, input.actualThirds) * config.qualThird;
  return { points };
}
