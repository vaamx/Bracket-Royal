import { describe, it, expect } from "vitest";
import { rankThirdPlaceTeams } from "@/lib/math/thirdPlace";
import type { TeamStanding } from "@/lib/math/types";

function row(teamId: string, points: number, gd: number, gf: number): TeamStanding {
  return {
    teamId, played: 3, won: 0, drawn: 0, lost: 0,
    goalsFor: gf, goalsAgainst: gf - gd, goalDifference: gd,
    points, conduct: 0, fifaRank: Number.POSITIVE_INFINITY,
  };
}

describe("rankThirdPlaceTeams", () => {
  it("returns the top 8 of 12 ordered by points, then GD, then goals", () => {
    const thirds: TeamStanding[] = Array.from({ length: 12 }, (_, k) => row(`T${k + 1}`, 12 - k, 12 - k, 20 - k));
    const best = rankThirdPlaceTeams(thirds);
    expect(best).toHaveLength(8);
    expect(best.map((r) => r.teamId)).toEqual(["T1","T2","T3","T4","T5","T6","T7","T8"]);
  });
  it("breaks equal points by goal difference then goals scored", () => {
    const thirds: TeamStanding[] = [ row("A", 4, 1, 3), row("B", 4, 2, 3), row("C", 4, 2, 5) ];
    const best = rankThirdPlaceTeams(thirds);
    expect(best.map((r) => r.teamId)).toEqual(["C", "B", "A"]);
  });
  it("uses FIFA rank as the final tiebreaker", () => {
    const a = row("A", 3, 0, 2); a.fifaRank = 10;
    const b = row("B", 3, 0, 2); b.fifaRank = 4;
    const best = rankThirdPlaceTeams([a, b]);
    expect(best.map((r) => r.teamId)).toEqual(["B", "A"]);
  });
});
