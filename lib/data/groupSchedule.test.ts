import { describe, it, expect } from "vitest";
import { buildGroupMatches } from "@/lib/data/groupSchedule";

describe("buildGroupMatches", () => {
  const teams = ["MEX", "BEL", "SCO", "JOR"];

  it("produces exactly 6 matches for a group of 4", () => {
    expect(buildGroupMatches("A", teams)).toHaveLength(6);
  });

  it("reproduces the canonical Group-A ids (matches the existing seed)", () => {
    const ids = buildGroupMatches("A", teams).map((m) => m.id);
    expect(ids).toEqual([
      "GA-MEX-BEL", "GA-SCO-JOR", "GA-MEX-SCO", "GA-BEL-JOR", "GA-MEX-JOR", "GA-BEL-SCO",
    ]);
  });

  it("pairs every team against every other exactly once", () => {
    const ms = buildGroupMatches("A", teams);
    const pairs = ms.map((m) => [m.home_team_id, m.away_team_id].sort().join("-")).sort();
    expect(new Set(pairs).size).toBe(6); // 4 choose 2
  });

  it("assigns matchdays 1..3, two matches each", () => {
    const ms = buildGroupMatches("A", teams);
    const byDay = ms.reduce<Record<number, number>>((acc, m) => {
      acc[m.matchday] = (acc[m.matchday] ?? 0) + 1;
      return acc;
    }, {});
    expect(byDay).toEqual({ 1: 2, 2: 2, 3: 2 });
  });

  it("tags every match with the group label and stage 'group'", () => {
    for (const m of buildGroupMatches("B", ["CAN", "MAR", "UZB", "CRC"])) {
      expect(m.group_label).toBe("B");
      expect(m.stage).toBe("group");
      expect(m.id.startsWith("GB-")).toBe(true);
    }
  });
});
