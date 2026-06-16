import type { LeagueScoringConfig } from "@/lib/scoring/types";

export interface StageSets {
  r32: string[];
  r16: string[];
  qf: string[];
  sf: string[];
  final: string[]; // the champion (final winner)
}

export interface KoScoreline {
  home: number | null;
  away: number | null;
}

export interface KnockoutScoreInput {
  predictedWinnersByStage: StageSets;
  actualWinnersByStage: StageSets;
  predictedThirds: string[]; // user's predicted best-8 third-place teams
  actualThirds: string[];    // actual best-8 third-place teams
  config: LeagueScoringConfig;
  /** Optional 90-minute scoreline predictions/results per KO match id. An exact
   *  regulation score earns `config.ko.exactBonus` on top of advancer points
   *  (the advancer points already cover "who won", so only exact scores bonus). */
  predictedScores?: Record<string, KoScoreline>;
  actualScores?: Record<string, KoScoreline>;
}

/** True set-intersection size — dedupes `a` so malformed (duplicate) picks can't inflate. */
function intersectionCount(a: string[], b: string[]): number {
  const set = new Set(b);
  return new Set(a.filter((x) => set.has(x))).size;
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

  // Exact 90-minute scoreline bonus per KO tie.
  const pred = input.predictedScores ?? {};
  const act = input.actualScores ?? {};
  for (const [matchId, ascore] of Object.entries(act)) {
    if (ascore.home === null || ascore.away === null) continue;
    const pscore = pred[matchId];
    if (!pscore || pscore.home === null || pscore.away === null) continue;
    if (pscore.home === ascore.home && pscore.away === ascore.away) points += config.ko.exactBonus;
  }

  return { points };
}
