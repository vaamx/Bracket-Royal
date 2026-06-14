/** Stage of a match in the tournament. */
export type Stage = "group" | "r32" | "r16" | "qf" | "sf" | "final" | "third";

/** Result of a single played match, from the perspective of two teams. */
export interface PlayedMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

/** Per-team conduct + ranking inputs used only as late tiebreakers. */
export interface TiebreakInputs {
  /** teamId -> conduct score (higher = WORSE; FIFA uses a negative-points card model). Default 0. */
  conduct?: Record<string, number>;
  /** teamId -> FIFA World Ranking position (lower number = better rank). Required for full tiebreaking. */
  fifaRank?: Record<string, number>;
}

/** A computed row in a group table. */
export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Conduct score carried through for tiebreaking (higher = worse). */
  conduct: number;
  /** FIFA rank carried through (lower = better); Infinity if unknown. */
  fifaRank: number;
}

/** Match outcome from the home team's perspective. */
export type Outcome = "home" | "draw" | "away";

/** A user's predicted scoreline for a match. */
export interface PredictedScore {
  home: number;
  away: number;
}

/** Configurable point values (mirrors leagues.scoring_config defaults). */
export interface GroupScoringConfig {
  exact: number; // exact scoreline
  goalDiff: number; // correct result + correct goal difference
  outcome: number; // correct result only
}

export const DEFAULT_GROUP_SCORING: GroupScoringConfig = {
  exact: 5,
  goalDiff: 3,
  outcome: 2,
};
