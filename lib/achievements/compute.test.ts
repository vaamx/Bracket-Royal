import { describe, it, expect } from "vitest";
import { computeAchievements } from "@/lib/achievements/compute";

type M = Parameters<typeof computeAchievements>[0]["groupMatches"][number];
function m(id: string, group: string, kickoff: string, hs: number | null, as: number | null): M {
  return { id, group_label: group, kickoff_at: kickoff, home_score: hs, away_score: as, status: hs === null ? "scheduled" : "final" };
}

describe("computeAchievements", () => {
  it("awards bullseye for one exact and tracks streak", () => {
    const groupMatches = [m("g1", "A", "2026-06-11T18:00:00Z", 2, 1)];
    const predictions = [{ match_id: "g1", predicted_home: 2, predicted_away: 1 }];
    const r = computeAchievements({ groupMatches, predictions });
    expect(r.badges).toContain("bullseye");
    expect(r.longestStreak).toBe(1);
  });

  it("awards sharpshooter at 5 exact and hot_streak at 3 in a row", () => {
    const groupMatches = Array.from({ length: 6 }, (_, i) => m(`g${i}`, "A", `2026-06-11T${10 + i}:00:00Z`, 1, 0));
    // Predict the first 5 exactly (consecutive), miss the 6th.
    const predictions = groupMatches.map((gm, i) => ({ match_id: gm.id, predicted_home: i < 5 ? 1 : 9, predicted_away: 0 }));
    const r = computeAchievements({ groupMatches, predictions });
    expect(r.badges).toEqual(expect.arrayContaining(["bullseye", "sharpshooter", "hot_streak"]));
    expect(r.longestStreak).toBe(5);
  });

  it("awards perfect_group only when all six of a group are exact", () => {
    const groupMatches = Array.from({ length: 6 }, (_, i) => m(`g${i}`, "A", `2026-06-11T${10 + i}:00:00Z`, 2, 0));
    const allRight = groupMatches.map((gm) => ({ match_id: gm.id, predicted_home: 2, predicted_away: 0 }));
    expect(computeAchievements({ groupMatches, predictions: allRight }).badges).toContain("perfect_group");
    const oneWrong = allRight.map((p, i) => (i === 0 ? { ...p, predicted_home: 0 } : p));
    expect(computeAchievements({ groupMatches, predictions: oneWrong }).badges).not.toContain("perfect_group");
  });

  it("awards oracle for the correct champion pick", () => {
    const r = computeAchievements({ groupMatches: [], predictions: [], finalWinnerTeamId: "BRA", finalPickTeamId: "BRA" });
    expect(r.badges).toContain("oracle");
    const wrong = computeAchievements({ groupMatches: [], predictions: [], finalWinnerTeamId: "BRA", finalPickTeamId: "ARG" });
    expect(wrong.badges).not.toContain("oracle");
  });

  it("breaks the streak on a miss", () => {
    const gm = [
      m("a", "A", "2026-06-11T10:00:00Z", 1, 0),
      m("b", "A", "2026-06-11T11:00:00Z", 1, 0),
      m("c", "A", "2026-06-11T12:00:00Z", 1, 0), // miss
      m("d", "A", "2026-06-11T13:00:00Z", 1, 0),
    ];
    const preds = [
      { match_id: "a", predicted_home: 1, predicted_away: 0 },
      { match_id: "b", predicted_home: 1, predicted_away: 0 },
      { match_id: "c", predicted_home: 5, predicted_away: 0 },
      { match_id: "d", predicted_home: 1, predicted_away: 0 },
    ];
    expect(computeAchievements({ groupMatches: gm, predictions: preds }).longestStreak).toBe(2);
  });
});
