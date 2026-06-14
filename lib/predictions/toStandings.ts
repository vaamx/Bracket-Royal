import { computeGroupStandings } from "@/lib/math";
import type { PlayedMatch, TeamStanding, TiebreakInputs } from "@/lib/math";

export interface StandingTeamRef {
  id: string;
  fifaRank: number;
}

export interface PredictedScoreRow {
  home_team_id: string;
  away_team_id: string;
  predicted_home: number | null;
  predicted_away: number | null;
}

/**
 * Build the predicted group table from a user's scoreline predictions.
 * Only matches with BOTH scores filled in count as "played". All four teams
 * always appear (zeroed if unpredicted) so the table renders in full.
 */
export function predictedStandings(
  teams: StandingTeamRef[],
  predictions: PredictedScoreRow[]
): TeamStanding[] {
  const played: PlayedMatch[] = predictions
    .filter((p) => p.predicted_home !== null && p.predicted_away !== null)
    .map((p) => ({
      homeTeamId: p.home_team_id,
      awayTeamId: p.away_team_id,
      homeScore: p.predicted_home as number,
      awayScore: p.predicted_away as number,
    }));

  const tb: TiebreakInputs = {
    fifaRank: Object.fromEntries(teams.map((t) => [t.id, t.fifaRank])),
  };

  // Correct order (incl. head-to-head) for every team that has a counted match.
  const ranked = computeGroupStandings(played, tb);

  // Teams with no counted match yet aren't in `ranked`; append them at the
  // bottom ordered by FIFA rank. This PRESERVES the math module's head-to-head
  // ordering for teams that do have results (do NOT re-sort `ranked`).
  const present = new Set(ranked.map((r) => r.teamId));
  const missing = teams
    .filter((t) => !present.has(t.id))
    .sort((a, b) => a.fifaRank - b.fifaRank)
    .map<TeamStanding>((t) => ({
      teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
      conduct: 0, fifaRank: t.fifaRank,
    }));

  return [...ranked, ...missing];
}
