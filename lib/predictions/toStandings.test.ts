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
});
