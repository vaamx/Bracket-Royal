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

describe("computeGroupStandings — tiebreakers", () => {
  it("breaks a points tie by head-to-head result first", () => {
    const m: PlayedMatch[] = [
      { homeTeamId: "X", awayTeamId: "Y", homeScore: 0, awayScore: 1 },
      { homeTeamId: "X", awayTeamId: "Z", homeScore: 2, awayScore: 1 },
      { homeTeamId: "Y", awayTeamId: "Z", homeScore: 1, awayScore: 2 },
    ];
    const table = computeGroupStandings(m);
    const order = table.map((r) => r.teamId);
    expect(order[0]).toBe("Z");
    expect(order.indexOf("Y")).toBeLessThan(order.indexOf("X"));
  });
  it("falls back to overall goal difference when head-to-head is level", () => {
    const m: PlayedMatch[] = [
      { homeTeamId: "P", awayTeamId: "R", homeScore: 1, awayScore: 0 },
      { homeTeamId: "Q", awayTeamId: "R", homeScore: 3, awayScore: 0 },
      { homeTeamId: "P", awayTeamId: "Q", homeScore: 1, awayScore: 1 },
    ];
    const table = computeGroupStandings(m);
    const order = table.map((r) => r.teamId);
    expect(order.indexOf("Q")).toBeLessThan(order.indexOf("P"));
  });
  it("uses FIFA rank as the final tiebreaker when all else is equal", () => {
    const m: PlayedMatch[] = [
      { homeTeamId: "L", awayTeamId: "H", homeScore: 0, awayScore: 0 },
    ];
    const table = computeGroupStandings(m, { fifaRank: { L: 3, H: 20 } });
    expect(table.map((r) => r.teamId)).toEqual(["L", "H"]);
  });
  it("breaks an otherwise-identical tie by conduct score (fewer cards ranks higher)", () => {
    const m: PlayedMatch[] = [
      { homeTeamId: "A", awayTeamId: "B", homeScore: 0, awayScore: 0 },
    ];
    // A has the worse conduct score (2) than B (0); everything else is equal.
    const table = computeGroupStandings(m, { conduct: { A: 2, B: 0 } });
    expect(table.map((r) => r.teamId)).toEqual(["B", "A"]);
  });
  it("returns all teams without hanging when a subset is genuinely, fully tied", () => {
    // Three teams draw each other 0-0: identical on every criterion, no ranks.
    // Exercises the recursion's termination branch (run not strictly smaller).
    const m: PlayedMatch[] = [
      { homeTeamId: "A", awayTeamId: "B", homeScore: 0, awayScore: 0 },
      { homeTeamId: "A", awayTeamId: "C", homeScore: 0, awayScore: 0 },
      { homeTeamId: "B", awayTeamId: "C", homeScore: 0, awayScore: 0 },
    ];
    const table = computeGroupStandings(m);
    expect(table).toHaveLength(3);
    expect([...table.map((r) => r.teamId)].sort()).toEqual(["A", "B", "C"]);
  });
});
