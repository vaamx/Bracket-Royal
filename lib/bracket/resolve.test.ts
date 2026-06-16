import { describe, it, expect } from "vitest";
import { resolveR32, assignThirds, type Qualifiers, type ThirdQualifier } from "@/lib/bracket/resolve";
import { thirdSlotClusters } from "@/lib/bracket/structure";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function quals(thirds: ThirdQualifier[]): Qualifiers {
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  for (const g of GROUPS) { winners[g] = `1${g}`; runners[g] = `2${g}`; }
  return { winners, runners, thirds };
}
// A legal set of 8 qualifying thirds (teamId "3X" from group X).
const THIRDS: ThirdQualifier[] = ["A", "B", "C", "D", "E", "F", "G", "H"].map((g) => ({ teamId: `3${g}`, group: g }));

describe("assignThirds", () => {
  it("places each qualifying third into a slot whose cluster includes its group, bijectively", () => {
    const m = assignThirds(THIRDS);
    const slots = thirdSlotClusters();
    expect(slots).toHaveLength(8);
    expect(m.size).toBe(8);
    const used = new Set<string>();
    for (const slot of slots) {
      const team = m.get(`${slot.matchId}:${slot.side}`);
      expect(team).toBeDefined();
      used.add(team!);
      expect(slot.cluster).toContain(team!.slice(1)); // "3A" -> group "A" must be in the slot's cluster
    }
    expect(used.size).toBe(8); // each third used exactly once
  });
});

describe("resolveR32 (official structure)", () => {
  it("fills all 16 ties; winners/runners land in their fixed official slots", () => {
    const ties = resolveR32(quals(THIRDS));
    expect(ties.size).toBe(16);
    expect(ties.get("R32-1")).toEqual({ homeTeamId: "2A", awayTeamId: "2B" });  // M73
    expect(ties.get("R32-3")).toEqual({ homeTeamId: "1F", awayTeamId: "2C" });  // M75
    expect(ties.get("R32-6")).toEqual({ homeTeamId: "2E", awayTeamId: "2I" });  // M78
    expect(ties.get("R32-7")!.homeTeamId).toBe("1A");                            // M79 (away is a third)
    expect(ties.get("R32-11")).toEqual({ homeTeamId: "2K", awayTeamId: "2L" }); // M83
    expect(ties.get("R32-16")).toEqual({ homeTeamId: "2D", awayTeamId: "2G" }); // M88
  });

  it("places all 32 qualifiers exactly once", () => {
    const all = [...resolveR32(quals(THIRDS)).values()].flatMap((t) => [t.homeTeamId, t.awayTeamId]);
    expect(new Set(all).size).toBe(32);
  });
});
