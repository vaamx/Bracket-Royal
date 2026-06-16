/** Full per-league scoring config (mirrors leagues.scoring_config JSON). */
export interface LeagueScoringConfig {
  exact: number;
  goalDiff: number;
  outcome: number;
  qualWinner: number;
  qualTop2: number;
  qualThird: number;
  ko: { r32: number; r16: number; qf: number; sf: number; champion: number; exactBonus: number };
  scorer: { hit: number; boot: number; bootExact: number };
}

export const DEFAULT_SCORING_CONFIG: LeagueScoringConfig = {
  exact: 5,
  goalDiff: 3,
  outcome: 2,
  qualWinner: 3,
  qualTop2: 2,
  qualThird: 2,
  ko: { r32: 10, r16: 15, qf: 25, sf: 40, champion: 60, exactBonus: 3 },
  scorer: { hit: 8, boot: 30, bootExact: 10 },
};

/** Parse a raw JSON scoring_config, falling back to defaults for any missing field. */
export function parseScoringConfig(raw: unknown): LeagueScoringConfig {
  const c = (raw ?? {}) as Partial<LeagueScoringConfig> & { ko?: Partial<LeagueScoringConfig["ko"]>; scorer?: Partial<LeagueScoringConfig["scorer"]> };
  const d = DEFAULT_SCORING_CONFIG;
  return {
    exact: c.exact ?? d.exact,
    goalDiff: c.goalDiff ?? d.goalDiff,
    outcome: c.outcome ?? d.outcome,
    qualWinner: c.qualWinner ?? d.qualWinner,
    qualTop2: c.qualTop2 ?? d.qualTop2,
    qualThird: c.qualThird ?? d.qualThird,
    ko: { ...d.ko, ...(c.ko ?? {}) },
    scorer: { ...d.scorer, ...(c.scorer ?? {}) },
  };
}

/** A finalized (or pending) match as seen by the scoring engine. */
export interface ScoringMatch {
  id: string;
  group_label: string | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  status: "scheduled" | "live" | "final";
}

/** One user's predicted scoreline for a match. */
export interface ScoringPrediction {
  match_id: string;
  predicted_home: number | null;
  predicted_away: number | null;
}

/** Team reference for tiebreaks. */
export interface ScoringTeam {
  id: string;
  group_label: string | null;
  fifaRank: number;
}

export interface GroupScoreResult {
  points: number;
  exactCount: number;
}
