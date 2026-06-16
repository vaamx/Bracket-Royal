import { describe, it, expect } from "vitest";
import { buildPredictedR32, type PredGroup } from "@/lib/bracket/predictedQualifiers";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// Build a group whose PREDICTED order is X1 > X2 > X3 > X4 (X1 wins all, X2 beats X3/X4, X3 beats X4).
// Each third (X3) ties on results, so its rank across groups is decided by fifaRank = group index.
function group(label: string, idx: number): PredGroup {
  const [t1, t2, t3, t4] = [`${label}1`, `${label}2`, `${label}3`, `${label}4`];
  const teams = [
    { id: t1, fifaRank: 100 + idx },
    { id: t2, fifaRank: 200 + idx },
    { id: t3, fifaRank: idx + 1 }, // third-place tiebreak ordering: A3 best (1) … L3 worst (12)
    { id: t4, fifaRank: 300 + idx },
  ];
  const m = (h: string, a: string, hs: number, as: number): PredGroup["matches"][number] => ({
    homeTeamId: h, awayTeamId: a, status: "scheduled", homeScore: null, awayScore: null, predictedHome: hs, predictedAway: as,
  });
  return {
    label,
    teams,
    matches: [m(t1, t2, 2, 0), m(t3, t4, 2, 0), m(t1, t3, 2, 0), m(t2, t4, 2, 0), m(t1, t4, 2, 0), m(t2, t3, 2, 0)],
  };
}

const groups = GROUPS.map((g, i) => group(g, i));

describe("buildPredictedR32", () => {
  it("slots the user's predicted winners & runners into the official R32 ties", () => {
    const r32 = buildPredictedR32(groups);
    expect(r32.size).toBe(16);
    expect(r32.get("R32-1")).toEqual({ homeTeamId: "A2", awayTeamId: "B2" });  // M73 RU A v RU B
    expect(r32.get("R32-2")).toEqual({ homeTeamId: "C1", awayTeamId: "F2" });  // M74 W C v RU F
    expect(r32.get("R32-4")).toEqual({ homeTeamId: "F1", awayTeamId: "C2" });  // M76 W F v RU C
    expect(r32.get("R32-5")).toEqual({ homeTeamId: "E2", awayTeamId: "I2" });  // M77 RU E v RU I
    expect(r32.get("R32-13")).toEqual({ homeTeamId: "D2", awayTeamId: "G2" }); // M85 RU D v RU G
    expect(r32.get("R32-14")).toEqual({ homeTeamId: "H1", awayTeamId: "J2" }); // M86 W H v RU J
    expect(r32.get("R32-3")!.homeTeamId).toBe("E1");  // M75 W E v 3rd
    expect(r32.get("R32-7")!.homeTeamId).toBe("A1");  // M79 W A v 3rd
    expect(r32.get("R32-16")!.homeTeamId).toBe("K1"); // M88 W K v 3rd
  });

  it("uses the 8 best predicted third-placed teams, all distinct", () => {
    const r32 = buildPredictedR32(groups);
    const all = [...r32.values()].flatMap((t) => [t.homeTeamId, t.awayTeamId]);
    expect(new Set(all).size).toBe(32);
    const thirds = all.filter((id) => id.endsWith("3")).sort();
    expect(thirds).toEqual(["A3", "B3", "C3", "D3", "E3", "F3", "G3", "H3"]); // best 8 by tiebreak
  });
});
