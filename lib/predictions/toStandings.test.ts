import { describe, it, expect } from "vitest";
import { predictedStandings } from "@/lib/predictions/toStandings";

const teams = [
  { id: "A", fifaRank: 1 },
  { id: "B", fifaRank: 2 },
  { id: "C", fifaRank: 3 },
  { id: "D", fifaRank: 4 },
];

describe("predictedStandings", () => {
  it("returns all teams at zero when there are no predicted scores", () => {
    const table = predictedStandings(teams, []);
    expect(table).toHaveLength(4);
    expect(table.every((r) => r.points === 0 && r.played === 0)).toBe(true);
  });

  it("counts only fully-predicted matches and ranks them", () => {
    const preds = [
      { home_team_id: "A", away_team_id: "B", predicted_home: 2, predicted_away: 0 },
      { home_team_id: "C", away_team_id: "D", predicted_home: 1, predicted_away: 1 },
      // A vs C left blank (nulls) -> ignored
      { home_team_id: "A", away_team_id: "C", predicted_home: null, predicted_away: null },
    ];
    const table = predictedStandings(teams, preds);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    expect(byId.A.points).toBe(3); // beat B
    expect(byId.A.played).toBe(1);
    expect(byId.C.points).toBe(1); // drew D
    expect(table[0].teamId).toBe("A"); // top of the table
  });

  it("uses fifaRank for tiebreaks among teams with no head-to-head", () => {
    // No predictions -> all level -> better rank first
    const table = predictedStandings(teams, []);
    expect(table.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
  });

  it("counts a 0-0 prediction as a played draw (0 is not null)", () => {
    const table = predictedStandings(teams, [
      { home_team_id: "A", away_team_id: "B", predicted_home: 0, predicted_away: 0 },
    ]);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    expect(byId.A.played).toBe(1);
    expect(byId.A.drawn).toBe(1);
    expect(byId.A.points).toBe(1);
    expect(byId.B.points).toBe(1);
  });

  it("preserves head-to-head order through the mapper (does not re-sort by rank)", () => {
    // Three teams all level on points; head-to-head says A > B > C, but FIFA ranks
    // are inverted (C best). A rank-based re-sort would give C,B,A — the mapper must NOT.
    const t3 = [
      { id: "A", fifaRank: 30 },
      { id: "B", fifaRank: 20 },
      { id: "C", fifaRank: 10 },
    ];
    // A beats B by 3, B beats C by 3, C beats A by 1 -> all 3 pts; H2H GD A:+2 B:0 C:-2
    const preds = [
      { home_team_id: "A", away_team_id: "B", predicted_home: 3, predicted_away: 0 },
      { home_team_id: "B", away_team_id: "C", predicted_home: 3, predicted_away: 0 },
      { home_team_id: "C", away_team_id: "A", predicted_home: 1, predicted_away: 0 },
    ];
    const order = predictedStandings(t3, preds).map((r) => r.teamId);
    expect(order).toEqual(["A", "B", "C"]); // head-to-head, not rank order C,B,A
  });
});
