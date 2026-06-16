export interface PredictTeam {
  id: string;
  name: string;
  flag: string | null;
  fifaRank: number;
}

export interface PredictMatch {
  id: string;
  matchday: number | null;
  homeTeamId: string;
  awayTeamId: string;
  kickoffAt: string | null;
  lockAt: string | null;
  status: "scheduled" | "live" | "final";
  /** Actual result (Plan 4); null until played. */
  homeScore: number | null;
  awayScore: number | null;
  /** The signed-in user's prediction, if any. */
  predictedHome: number | null;
  predictedAway: number | null;
}

export interface PredictGroup {
  label: string;
  teams: PredictTeam[];
  matches: PredictMatch[];
}
