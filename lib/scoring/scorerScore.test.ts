import { describe, it, expect } from "vitest";
import { scoreUserScorers } from "@/lib/scoring/scorerScore";
import { DEFAULT_SCORING_CONFIG as cfg } from "@/lib/scoring/types";

describe("scoreUserScorers", () => {
  const base = { actualTop10: ["A","B","C","D","E","F","G","H","I","J"], actualTopScorerIds: ["A"], bootActualGoals: 7, config: cfg };
  it("awards hit points per pick in the actual top 10 (dedup-safe)", () => {
    const { points } = scoreUserScorers({ picks: ["A","B","X","B"], goldenBootId: null, goldenBootPredictedGoals: null, ...base });
    expect(points).toBe(2 * cfg.scorer.hit);
  });
  it("adds the boot bonus when the golden boot is the actual top scorer", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: null, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });
  it("counts a boot tied for #1 as correct", () => {
    const { points } = scoreUserScorers({ picks: ["B"], goldenBootId: "B", goldenBootPredictedGoals: null, ...base, actualTopScorerIds: ["A","B"] });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });
  it("adds the exact-goals bonus when boot predicted goals match its actual goals", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: 7, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot + cfg.scorer.bootExact);
  });
  it("no exact bonus on a wrong tally", () => {
    const { points } = scoreUserScorers({ picks: ["A"], goldenBootId: "A", goldenBootPredictedGoals: 5, ...base });
    expect(points).toBe(cfg.scorer.hit + cfg.scorer.boot);
  });
  it("zero when nothing matches", () => {
    const { points } = scoreUserScorers({ picks: ["X","Y"], goldenBootId: "X", goldenBootPredictedGoals: 3, ...base });
    expect(points).toBe(0);
  });
});
