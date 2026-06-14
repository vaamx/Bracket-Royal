import { describe, it, expect } from "vitest";
import { parseFootballDataMatches } from "@/lib/feed/footballData";
import sample from "@/lib/feed/sample-football-data.json";

describe("parseFootballDataMatches", () => {
  it("normalizes only FINISHED matches via the supplied id resolver", () => {
    // resolver maps a provider match to our id by home/away TLA (group A here).
    const resolve = (home: string, away: string) => `GA-${home}-${away}`;
    const out = parseFootballDataMatches(sample, resolve);
    expect(out).toEqual([{ matchId: "GA-MEX-BEL", homeScore: 2, awayScore: 1 }]);
  });

  it("skips matches the resolver can't map (returns null)", () => {
    const out = parseFootballDataMatches(sample, () => null);
    expect(out).toEqual([]);
  });
});
