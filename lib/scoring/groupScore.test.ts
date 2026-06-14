import { describe, it, expect } from "vitest";
import { scoreUserGroupStage } from "@/lib/scoring/groupScore";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";
import type { ScoringMatch, ScoringPrediction, ScoringTeam } from "@/lib/scoring/types";

const cfg = DEFAULT_SCORING_CONFIG;

const teams: ScoringTeam[] = [
  { id: "A", group_label: "X", fifaRank: 1 },
  { id: "B", group_label: "X", fifaRank: 2 },
  { id: "C", group_label: "X", fifaRank: 3 },
  { id: "D", group_label: "X", fifaRank: 4 },
];

// Full group X (6 matches). Actual outcome makes A win the group, B second.
function groupX(allFinal: boolean): ScoringMatch[] {
  const m = (id: string, h: string, a: string, hs: number | null, as: number | null): ScoringMatch => ({
    id, group_label: "X", home_team_id: h, away_team_id: a,
    home_score: allFinal ? hs : null, away_score: allFinal ? as : null,
    status: allFinal ? "final" : "scheduled",
  });
  return [
    m("X1", "A", "B", 1, 0),
    m("X2", "C", "D", 2, 2),
    m("X3", "A", "C", 3, 0),
    m("X4", "B", "D", 1, 0),
    m("X5", "A", "D", 2, 1),
    m("X6", "B", "C", 2, 1),
  ];
}

describe("scoreUserGroupStage", () => {
  it("awards match points only for final matches the user predicted", () => {
    const matches = groupX(true);
    const preds: ScoringPrediction[] = [
      { match_id: "X1", predicted_home: 1, predicted_away: 0 }, // exact -> 5
      { match_id: "X2", predicted_home: 1, predicted_away: 1 }, // right result (draw), wrong score -> 2
      { match_id: "X3", predicted_home: 2, predicted_away: 0 }, // right result + right GD? actual 3-0 GD3, pred 2-0 GD2 -> outcome only 2
    ];
    const { points } = scoreUserGroupStage(preds, matches, teams, cfg);
    // 5 + 2 + 2 = 9 match points, plus group-complete bonuses (predicted winner A? only partial preds)
    expect(points).toBeGreaterThanOrEqual(9);
  });

  it("counts exact scorelines", () => {
    const matches = groupX(true);
    const preds: ScoringPrediction[] = [
      { match_id: "X1", predicted_home: 1, predicted_away: 0 },
      { match_id: "X5", predicted_home: 2, predicted_away: 1 },
    ];
    const { exactCount } = scoreUserGroupStage(preds, matches, teams, cfg);
    expect(exactCount).toBe(2);
  });

  it("does not score unfinished matches", () => {
    const matches = groupX(false); // none final
    const preds: ScoringPrediction[] = [{ match_id: "X1", predicted_home: 1, predicted_away: 0 }];
    expect(scoreUserGroupStage(preds, matches, teams, cfg).points).toBe(0);
  });

  it("awards the winner bonus when the predicted group winner is correct", () => {
    const matches = groupX(true); // actual winner: A (3 wins)
    // Predict every match so the predicted table is complete; predict A to win all.
    const preds: ScoringPrediction[] = matches.map((m) => ({
      match_id: m.id,
      predicted_home: m.home_team_id === "A" ? 1 : 0,
      predicted_away: m.away_team_id === "A" ? 1 : 0,
    }));
    // Compare against a baseline where the user predicts the exact opposite winner.
    const withA = scoreUserGroupStage(preds, matches, teams, cfg).points;
    const predsWrong: ScoringPrediction[] = matches.map((m) => ({
      match_id: m.id,
      predicted_home: m.home_team_id === "D" ? 1 : 0,
      predicted_away: m.away_team_id === "D" ? 1 : 0,
    }));
    const withD = scoreUserGroupStage(predsWrong, matches, teams, cfg).points;
    expect(withA).toBeGreaterThan(withD); // correct-winner bonus contributes
  });

  it("awards qualifier bonus for each correct top-2 team", () => {
    const matches = groupX(true); // actual top 2: A, B
    // User predicts A and B as top 2 (predict them winning their matches).
    const preds: ScoringPrediction[] = matches.map((m) => {
      const fav = (t: string) => t === "A" || t === "B";
      return {
        match_id: m.id,
        predicted_home: fav(m.home_team_id) && !fav(m.away_team_id) ? 1 : 0,
        predicted_away: fav(m.away_team_id) && !fav(m.home_team_id) ? 1 : 0,
      };
    });
    const res = scoreUserGroupStage(preds, matches, teams, cfg);
    // Should include 2x qualTop2 (=4) on top of match points + winner bonus.
    const noBonus = scoreUserGroupStage(
      preds,
      matches.map((m) => ({ ...m, status: "scheduled", home_score: null, away_score: null })),
      teams,
      cfg
    );
    expect(res.points - noBonus.points).toBeGreaterThanOrEqual(cfg.qualTop2 * 2);
  });

  it("awards NO group bonus to a user who predicted nothing in the group", () => {
    // Regression: predictedStandings([]) falls back to FIFA-rank order, which
    // matches the favorites — a non-participant must NOT collect free bonuses.
    const matches = groupX(true); // complete group, favorites (A,B) finish top-2
    expect(scoreUserGroupStage([], matches, teams, cfg).points).toBe(0);
  });

  it("scores a perfect predictor as exact match points + full bonuses", () => {
    const matches = groupX(true);
    // Predict every scoreline exactly → 6×exact(5)=30 match pts, exactCount 6,
    // predicted table == actual → winner(+3) + both top-2(+2+2). Total 30+7=37.
    const perfect: ScoringPrediction[] = matches.map((m) => ({
      match_id: m.id,
      predicted_home: m.home_score,
      predicted_away: m.away_score,
    }));
    const res = scoreUserGroupStage(perfect, matches, teams, cfg);
    expect(res.exactCount).toBe(6);
    expect(res.points).toBe(6 * cfg.exact + cfg.qualWinner + cfg.qualTop2 * 2); // 30 + 3 + 4 = 37
  });
});
