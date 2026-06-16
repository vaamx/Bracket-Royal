import { describe, it, expect } from "vitest";
import { toPlayerRows, parseScorerGoals, CONTENDER_NAMES } from "@/lib/feed/ingestPlayers";

describe("toPlayerRows", () => {
  it("flattens squads into player rows with team tla + contender flag", () => {
    const payload = { teams: [
      { tla: "FRA", squad: [{ id: 1, name: "Kylian Mbappé", position: "Offence" }, { id: 2, name: "Some Defender", position: "Defence" }] },
      { tla: "ARG", squad: [{ id: 3, name: "Lionel Messi", position: "Offence" }] },
    ] };
    const rows = toPlayerRows(payload);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ id: "1", name: "Kylian Mbappé", team_id: "FRA", position: "Offence", is_contender: true });
    expect(rows[1].is_contender).toBe(false);
  });
  it("skips players without an id and teams without a tla", () => {
    const rows = toPlayerRows({ teams: [{ tla: null, squad: [{ id: 9, name: "X" }] }, { tla: "BRA", squad: [{ id: null, name: "Y" }] }] });
    expect(rows).toEqual([]);
  });
});

describe("parseScorerGoals", () => {
  it("maps the scorers payload to id->goals with 1-based rank", () => {
    const payload = { scorers: [ { player: { id: 1 }, goals: 5 }, { player: { id: 2 }, goals: 3 } ] };
    expect(parseScorerGoals(payload)).toEqual([ { id: "1", goals: 5, scorer_rank: 1 }, { id: "2", goals: 3, scorer_rank: 2 } ]);
  });
});

it("contender list is non-empty and includes known stars", () => {
  expect(CONTENDER_NAMES.length).toBeGreaterThan(10);
  expect(CONTENDER_NAMES).toContain("Kylian Mbappé");
});
