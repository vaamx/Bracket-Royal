import { scorePrediction, computeGroupStandings } from "@/lib/math";
import { predictedStandings } from "@/lib/predictions/toStandings";
import type {
  LeagueScoringConfig,
  ScoringMatch,
  ScoringPrediction,
  ScoringTeam,
  GroupScoreResult,
} from "@/lib/scoring/types";

function isFinal(m: ScoringMatch): boolean {
  return m.status === "final" && m.home_score !== null && m.away_score !== null;
}

/**
 * Score one user's GROUP STAGE: per-match points (5/3/2/0) for final matches they
 * predicted, plus per-completed-group bonuses (correct winner, each correct top-2
 * qualifier). Pure and idempotent — safe to recompute from scratch.
 */
export function scoreUserGroupStage(
  predictions: ScoringPrediction[],
  matches: ScoringMatch[],
  teams: ScoringTeam[],
  config: LeagueScoringConfig
): GroupScoreResult {
  const predByMatch = new Map(predictions.map((p) => [p.match_id, p]));
  let points = 0;
  let exactCount = 0;

  // 1. Per-match points.
  for (const m of matches) {
    if (!isFinal(m)) continue;
    const p = predByMatch.get(m.id);
    if (!p || p.predicted_home === null || p.predicted_away === null) continue;
    points += scorePrediction(
      { home: p.predicted_home, away: p.predicted_away },
      { home: m.home_score as number, away: m.away_score as number },
      { exact: config.exact, goalDiff: config.goalDiff, outcome: config.outcome }
    );
    if (p.predicted_home === m.home_score && p.predicted_away === m.away_score) exactCount++;
  }

  // 2. Per-completed-group qualification bonuses.
  const groupLabels = [...new Set(teams.map((t) => t.group_label).filter(Boolean))] as string[];
  for (const g of groupLabels) {
    const groupMatches = matches.filter((m) => m.group_label === g);
    if (groupMatches.length === 0 || !groupMatches.every(isFinal)) continue;
    const groupTeams = teams.filter((t) => t.group_label === g);
    const fifaRank = Object.fromEntries(groupTeams.map((t) => [t.id, t.fifaRank]));

    const actual = computeGroupStandings(
      groupMatches.map((m) => ({
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeScore: m.home_score as number,
        awayScore: m.away_score as number,
      })),
      { fifaRank }
    );

    const predicted = predictedStandings(
      groupTeams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
      groupMatches.map((m) => {
        const p = predByMatch.get(m.id);
        return {
          home_team_id: m.home_team_id,
          away_team_id: m.away_team_id,
          predicted_home: p?.predicted_home ?? null,
          predicted_away: p?.predicted_away ?? null,
        };
      })
    );

    if (actual[0] && predicted[0] && actual[0].teamId === predicted[0].teamId) {
      points += config.qualWinner;
    }
    const predTop2 = new Set(predicted.slice(0, 2).map((r) => r.teamId));
    for (const r of actual.slice(0, 2)) {
      if (predTop2.has(r.teamId)) points += config.qualTop2;
    }
  }

  return { points, exactCount };
}
