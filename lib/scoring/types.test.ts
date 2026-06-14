import { describe, it, expect } from "vitest";
import { parseScoringConfig, DEFAULT_SCORING_CONFIG } from "@/lib/scoring/types";

describe("parseScoringConfig", () => {
  it("returns the defaults for empty/nullish input", () => {
    expect(parseScoringConfig(null)).toEqual(DEFAULT_SCORING_CONFIG);
    expect(parseScoringConfig(undefined)).toEqual(DEFAULT_SCORING_CONFIG);
    expect(parseScoringConfig({})).toEqual(DEFAULT_SCORING_CONFIG);
  });

  it("overrides only the provided top-level fields", () => {
    const c = parseScoringConfig({ exact: 10, qualWinner: 5 });
    expect(c.exact).toBe(10);
    expect(c.qualWinner).toBe(5);
    expect(c.goalDiff).toBe(DEFAULT_SCORING_CONFIG.goalDiff);
    expect(c.outcome).toBe(DEFAULT_SCORING_CONFIG.outcome);
  });

  it("merges nested ko config, keeping defaults for unspecified rounds", () => {
    const c = parseScoringConfig({ ko: { champion: 100 } });
    expect(c.ko.champion).toBe(100);
    expect(c.ko.r32).toBe(DEFAULT_SCORING_CONFIG.ko.r32);
    expect(c.ko.sf).toBe(DEFAULT_SCORING_CONFIG.ko.sf);
  });
});
