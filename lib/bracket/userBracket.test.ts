import { describe, it, expect } from "vitest";
import { buildBracketView, type R32Teams } from "@/lib/bracket/userBracket";

// Official feeds: R32-2 (home) and R32-5 (away) feed R16-1; R16-1 feeds QF-1 (home).
const r32: R32Teams = {
  "R32-1": { homeTeamId: "W", awayTeamId: "X" },
  "R32-2": { homeTeamId: "A", awayTeamId: "B" },
  "R32-5": { homeTeamId: "C", awayTeamId: "D" },
};

describe("buildBracketView", () => {
  it("propagates R32 winner picks into the R16 slots (R32-2,R32-5 → R16-1)", () => {
    const { view } = buildBracketView(r32, { "R32-2": "A", "R32-5": "C" });
    expect(view["R16-1"].homeTeamId).toBe("A");
    expect(view["R16-1"].awayTeamId).toBe("C");
  });

  it("keeps a valid pick and exposes it on the view", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "W" });
    expect(view["R32-1"].pick).toBe("W");
    expect(validPicks["R32-1"]).toBe("W");
  });

  it("ignores a pick that isn't one of the tie's two teams", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "Z" });
    expect(view["R32-1"].pick).toBeUndefined();
    expect(validPicks["R32-1"]).toBeUndefined();
  });

  it("prunes a downstream pick when an upstream change removes its team", () => {
    let picks: Record<string, string> = { "R32-2": "A", "R32-5": "C", "R16-1": "A" };
    expect(buildBracketView(r32, picks).validPicks["R16-1"]).toBe("A");
    // Change R32-2 to B: A is no longer in R16-1, so the R16-1 pick is pruned.
    picks = { ...picks, "R32-2": "B" };
    const { view, validPicks } = buildBracketView(r32, picks);
    expect(view["R16-1"].homeTeamId).toBe("B");
    expect(validPicks["R16-1"]).toBeUndefined();
  });

  it("collapses the whole downstream subtree (multi-level) when an upstream pick changes", () => {
    // A advances R32-2 → R16-1 → QF-1.
    let picks: Record<string, string> = { "R32-2": "A", "R32-5": "C", "R16-1": "A", "QF-1": "A" };
    let res = buildBracketView(r32, picks);
    expect(res.validPicks["R16-1"]).toBe("A");
    expect(res.validPicks["QF-1"]).toBe("A");
    // Orphan A at the root: both R16-1 AND QF-1 picks must vanish (transitive collapse).
    picks = { ...picks, "R32-2": "B" };
    res = buildBracketView(r32, picks);
    expect(res.validPicks["R16-1"]).toBeUndefined();
    expect(res.validPicks["QF-1"]).toBeUndefined();
  });

  it("propagates winners to the final and drops both semifinal losers into the third-place match", () => {
    const full: R32Teams = {};
    for (let n = 1; n <= 16; n++) full[`R32-${n}`] = { homeTeamId: `h${n}`, awayTeamId: `a${n}` };

    // Pick the home team at every match, round by round (teams are known only after upstream picks).
    const picks: Record<string, string> = {};
    for (const [prefix, count] of [["R32", 16], ["R16", 8], ["QF", 4], ["SF", 2]] as const) {
      const { view } = buildBracketView(full, picks);
      for (let n = 1; n <= count; n++) {
        const home = view[`${prefix}-${n}`]?.homeTeamId;
        if (home) picks[`${prefix}-${n}`] = home;
      }
    }

    const { view } = buildBracketView(full, picks);
    // Final filled by the two SF winners; third-place filled by the two SF losers.
    expect(view["F-1"].homeTeamId).toBeDefined();
    expect(view["F-1"].awayTeamId).toBeDefined();
    expect(view["3RD-1"].homeTeamId).toBeDefined();
    expect(view["3RD-1"].awayTeamId).toBeDefined();
    expect(view["3RD-1"].homeTeamId).not.toBe(view["F-1"].homeTeamId); // loser ≠ winner of SF-1
  });
});
