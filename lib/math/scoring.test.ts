import { describe, it, expect } from "vitest";
import { outcomeOf } from "@/lib/math/scoring";

describe("outcomeOf", () => {
  it("returns home when home scores more", () => { expect(outcomeOf(2, 1)).toBe("home"); });
  it("returns away when away scores more", () => { expect(outcomeOf(0, 3)).toBe("away"); });
  it("returns draw when level", () => { expect(outcomeOf(1, 1)).toBe("draw"); });
});

import { scorePrediction } from "@/lib/math/scoring";
import { DEFAULT_GROUP_SCORING } from "@/lib/math/types";

describe("scorePrediction (default config 5/3/2/0)", () => {
  const cfg = DEFAULT_GROUP_SCORING;
  it("awards exact for a perfect scoreline", () => { expect(scorePrediction({ home: 2, away: 1 }, { home: 2, away: 1 }, cfg)).toBe(5); });
  it("awards goalDiff for right result + right goal difference, wrong score", () => { expect(scorePrediction({ home: 2, away: 1 }, { home: 3, away: 2 }, cfg)).toBe(3); });
  it("awards outcome for right result, wrong goal difference", () => { expect(scorePrediction({ home: 1, away: 0 }, { home: 3, away: 0 }, cfg)).toBe(2); });
  it("awards 0 for wrong result", () => { expect(scorePrediction({ home: 2, away: 1 }, { home: 0, away: 1 }, cfg)).toBe(0); });
  it("treats an exact draw as exact, not goalDiff", () => { expect(scorePrediction({ home: 1, away: 1 }, { home: 1, away: 1 }, cfg)).toBe(5); });
  it("awards outcome (not goalDiff) for a non-exact draw", () => { expect(scorePrediction({ home: 0, away: 0 }, { home: 2, away: 2 }, cfg)).toBe(2); });
});
