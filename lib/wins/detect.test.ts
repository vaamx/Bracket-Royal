import { describe, it, expect } from "vitest";
import { detectDailyWins } from "@/lib/wins/detect";

const base = {
  finalMatches: [{ id: "G-1", homeCode: "BRA", awayCode: "ARG", homeScore: 2, awayScore: 1 }],
  playerGoals: { p1: 5, p2: 0 },
  playerName: { p1: "Messi", p2: "Kane" },
};

describe("detectDailyWins", () => {
  it("awards an exact-score medal when the scoreline is nailed", () => {
    const wins = detectDailyWins({
      ...base,
      predictionsByUser: new Map([["u1", [{ matchId: "G-1", predHome: 2, predAway: 1 }]]]),
      scorerByUser: new Map(),
      tournamentComplete: false,
    });
    expect(wins.get("u1")).toEqual([{ winKey: "exact:G-1", kind: "exact", detail: "BRA 2–1 ARG" }]);
  });

  it("does not award when the scoreline is wrong or unpredicted", () => {
    const wins = detectDailyWins({
      ...base,
      predictionsByUser: new Map([
        ["u1", [{ matchId: "G-1", predHome: 1, predAway: 1 }]],
        ["u2", [{ matchId: "G-1", predHome: null, predAway: null }]],
      ]),
      scorerByUser: new Map(),
      tournamentComplete: false,
    });
    expect(wins.size).toBe(0);
  });

  it("withholds goal medals until the tournament is complete", () => {
    const args = {
      ...base,
      predictionsByUser: new Map(),
      scorerByUser: new Map([["u1", [{ playerId: "p1", predictedGoals: 5 }]]]),
    };
    expect(detectDailyWins({ ...args, tournamentComplete: false }).size).toBe(0);
    expect(detectDailyWins({ ...args, tournamentComplete: true }).get("u1")).toEqual([
      { winKey: "goals:p1", kind: "goals", detail: "Messi · 5" },
    ]);
  });

  it("ignores trivial zero-goal predictions and wrong tallies", () => {
    const wins = detectDailyWins({
      ...base,
      predictionsByUser: new Map(),
      scorerByUser: new Map([["u1", [
        { playerId: "p2", predictedGoals: 0 },   // trivial 0 == 0
        { playerId: "p1", predictedGoals: 3 },   // wrong (actual 5)
      ]]]),
      tournamentComplete: true,
    });
    expect(wins.size).toBe(0);
  });

  it("combines exact and goal medals for one user", () => {
    const wins = detectDailyWins({
      ...base,
      predictionsByUser: new Map([["u1", [{ matchId: "G-1", predHome: 2, predAway: 1 }]]]),
      scorerByUser: new Map([["u1", [{ playerId: "p1", predictedGoals: 5 }]]]),
      tournamentComplete: true,
    });
    expect(wins.get("u1")?.map((w) => w.kind).sort()).toEqual(["exact", "goals"]);
  });
});
