import { describe, it, expect } from "vitest";
import { computeGroupStandings } from "@/lib/math/standings";
import type { PlayedMatch } from "@/lib/math/types";

const matches: PlayedMatch[] = [
  { homeTeamId: "A", awayTeamId: "B", homeScore: 2, awayScore: 0 },
  { homeTeamId: "A", awayTeamId: "C", homeScore: 1, awayScore: 0 },
  { homeTeamId: "A", awayTeamId: "D", homeScore: 1, awayScore: 1 },
  { homeTeamId: "B", awayTeamId: "C", homeScore: 3, awayScore: 1 },
  { homeTeamId: "B", awayTeamId: "D", homeScore: 2, awayScore: 0 },
  { homeTeamId: "C", awayTeamId: "D", homeScore: 1, awayScore: 0 },
];

describe("computeGroupStandings — base accumulation", () => {
  it("accumulates points, goals, and goal difference correctly", () => {
    const table = computeGroupStandings(matches);
    const byId = Object.fromEntries(table.map((r) => [r.teamId, r]));
    expect(byId.A.points).toBe(7);
    expect(byId.A.goalsFor).toBe(4);
    expect(byId.A.goalsAgainst).toBe(1);
    expect(byId.A.goalDifference).toBe(3);
    expect(byId.A.played).toBe(3);
    expect(byId.B.points).toBe(6);
    expect(byId.B.goalDifference).toBe(2);
    expect(byId.D.points).toBe(1);
    expect(byId.D.goalDifference).toBe(-3);
  });
  it("orders the table by points first (A then B then C then D)", () => {
    const table = computeGroupStandings(matches);
    expect(table.map((r) => r.teamId)).toEqual(["A", "B", "C", "D"]);
  });
});
