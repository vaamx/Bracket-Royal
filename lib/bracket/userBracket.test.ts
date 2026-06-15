import { describe, it, expect } from "vitest";
import { buildBracketView } from "@/lib/bracket/userBracket";

// Minimal R32 fixture: only the two ties that feed R16-1.
const r32 = {
  "R32-1": { homeTeamId: "A", awayTeamId: "B" },
  "R32-2": { homeTeamId: "C", awayTeamId: "D" },
};

describe("buildBracketView", () => {
  it("propagates R32 winner picks into the R16 slots", () => {
    const { view } = buildBracketView(r32, { "R32-1": "A", "R32-2": "C" });
    expect(view["R16-1"].homeTeamId).toBe("A");
    expect(view["R16-1"].awayTeamId).toBe("C");
  });

  it("keeps a valid pick and exposes it on the view", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "A" });
    expect(view["R32-1"].pick).toBe("A");
    expect(validPicks["R32-1"]).toBe("A");
  });

  it("ignores a pick that isn't one of the tie's two teams", () => {
    const { view, validPicks } = buildBracketView(r32, { "R32-1": "Z" });
    expect(view["R32-1"].pick).toBeUndefined();
    expect(validPicks["R32-1"]).toBeUndefined();
  });

  it("prunes a downstream pick when an upstream change removes its team", () => {
    // User picked A into R16-1 and then picked A to win R16-1.
    let picks: Record<string, string> = { "R32-1": "A", "R32-2": "C", "R16-1": "A" };
    expect(buildBracketView(r32, picks).validPicks["R16-1"]).toBe("A");
    // Now change R32-1 to B: A is no longer in R16-1, so the R16-1 pick is pruned.
    picks = { ...picks, "R32-1": "B" };
    const { view, validPicks } = buildBracketView(r32, picks);
    expect(view["R16-1"].homeTeamId).toBe("B");
    expect(validPicks["R16-1"]).toBeUndefined();
  });

  it("collapses the whole downstream subtree (multi-level) when an upstream pick changes", () => {
    // A advanced all the way: R32-1 → R16-1 → QF-1.
    let picks: Record<string, string> = { "R32-1": "A", "R32-2": "C", "R16-1": "A", "QF-1": "A" };
    let res = buildBracketView(r32, picks);
    expect(res.validPicks["R16-1"]).toBe("A");
    expect(res.validPicks["QF-1"]).toBe("A");
    // Orphan A at the root: both R16-1 AND QF-1 picks must vanish (transitive collapse).
    picks = { ...picks, "R32-1": "B" };
    res = buildBracketView(r32, picks);
    expect(res.validPicks["R16-1"]).toBeUndefined();
    expect(res.validPicks["QF-1"]).toBeUndefined();
  });

  it("propagates SF winners to the final and SF losers to the third-place match", () => {
    // Full 16-tie fixture; picking every HOME team makes the bracket deterministic.
    const full: Record<string, { homeTeamId: string; awayTeamId: string }> = {};
    for (let n = 1; n <= 16; n++) full[`R32-${n}`] = { homeTeamId: `h${n}`, awayTeamId: `a${n}` };

    const picks: Record<string, string> = {};
    for (let n = 1; n <= 16; n++) picks[`R32-${n}`] = `h${n}`;        // R32 winners: h1..h16
    for (let n = 1; n <= 8; n++) picks[`R16-${n}`] = `h${2 * n - 1}`; // R16 home = h(2n-1)
    for (let n = 1; n <= 4; n++) picks[`QF-${n}`] = `h${4 * n - 3}`;  // QF home = h(4n-3): h1,h5,h9,h13
    // SF-1 = {h1 (QF-1), h5 (QF-2)}; SF-2 = {h9 (QF-3), h13 (QF-4)}.
    picks["SF-1"] = "h1"; // loser h5
    picks["SF-2"] = "h9"; // loser h13

    const { view } = buildBracketView(full, picks);
    expect(view["F-1"]).toMatchObject({ homeTeamId: "h1", awayTeamId: "h9" });
    expect(view["3RD-1"]).toMatchObject({ homeTeamId: "h5", awayTeamId: "h13" });
  });
});
