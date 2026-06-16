import { describe, it, expect } from "vitest";
import { scoreUserKnockout } from "@/lib/scoring/knockoutScore";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";

const cfg = DEFAULT_SCORING_CONFIG;

describe("scoreUserKnockout", () => {
  it("awards round points for each correctly predicted advancer", () => {
    // Actual R32 winners: A,B,C,D. User predicted A,B,X,Y to win their R32 ties.
    const actualWinnersByStage = { r32: ["A", "B", "C", "D"], r16: [], qf: [], sf: [], final: [] };
    const predictedWinnersByStage = { r32: ["A", "B", "X", "Y"], r16: [], qf: [], sf: [], final: [] };
    const { points } = scoreUserKnockout({ predictedWinnersByStage, actualWinnersByStage, predictedThirds: [], actualThirds: [], config: cfg });
    expect(points).toBe(2 * cfg.ko.r32); // 2 correct R32 advancers
  });

  it("awards the champion bonus only for the correct final winner", () => {
    const right = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    }).points;
    const wrong = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["B"] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    }).points;
    expect(right).toBe(cfg.ko.champion);
    expect(wrong).toBe(0);
  });

  it("awards the best-third bonus per correctly predicted qualifying third", () => {
    const { points } = scoreUserKnockout({
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      predictedThirds: ["T0", "T1", "X"],
      actualThirds: ["T0", "T1", "T2"],
      config: cfg,
    });
    expect(points).toBe(2 * cfg.qualThird); // T0, T1 correct
  });

  it("sums all stages", () => {
    const { points } = scoreUserKnockout({
      predictedWinnersByStage: { r32: ["A"], r16: ["A"], qf: ["A"], sf: ["A"], final: ["A"] },
      actualWinnersByStage: { r32: ["A"], r16: ["A"], qf: ["A"], sf: ["A"], final: ["A"] },
      predictedThirds: [], actualThirds: [], config: cfg,
    });
    expect(points).toBe(cfg.ko.r32 + cfg.ko.r16 + cfg.ko.qf + cfg.ko.sf + cfg.ko.champion);
  });

  it("awards the exact-score bonus only for an exact KO scoreline", () => {
    const base = {
      predictedWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      actualWinnersByStage: { r32: [], r16: [], qf: [], sf: [], final: [] },
      predictedThirds: [], actualThirds: [], config: cfg,
    };
    const actualScores = { "R32-1": { home: 2, away: 1 }, "R32-2": { home: 0, away: 0 } };
    // Exact on R32-1, wrong score on R32-2, missing on others.
    const exactOne = scoreUserKnockout({
      ...base,
      predictedScores: { "R32-1": { home: 2, away: 1 }, "R32-2": { home: 1, away: 0 } },
      actualScores,
    }).points;
    expect(exactOne).toBe(cfg.ko.exactBonus); // only R32-1 exact

    // Both exact → 2x bonus.
    const exactTwo = scoreUserKnockout({
      ...base,
      predictedScores: { "R32-1": { home: 2, away: 1 }, "R32-2": { home: 0, away: 0 } },
      actualScores,
    }).points;
    expect(exactTwo).toBe(2 * cfg.ko.exactBonus);

    // No scoreline predictions → no bonus.
    const none = scoreUserKnockout({ ...base, actualScores }).points;
    expect(none).toBe(0);
  });

  it("does not inflate when a team appears twice in a predicted set (malformed input)", () => {
    const { points } = scoreUserKnockout({
      predictedWinnersByStage: { r32: ["A", "A"], r16: [], qf: [], sf: [], final: [] },
      actualWinnersByStage: { r32: ["A"], r16: [], qf: [], sf: [], final: [] },
      predictedThirds: [], actualThirds: [], config: cfg,
    });
    expect(points).toBe(cfg.ko.r32); // counted once, not twice
  });
});
