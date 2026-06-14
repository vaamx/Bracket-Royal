import { describe, it, expect } from "vitest";
import { resolveR32, type Qualifiers } from "@/lib/bracket/resolve";

function qualifiers(): Qualifiers {
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  for (const g of ["A","B","C","D","E","F","G","H","I","J","K","L"]) {
    winners[g] = `1${g}`;
    runners[g] = `2${g}`;
  }
  const thirds = ["T0","T1","T2","T3","T4","T5","T6","T7"];
  return { winners, runners, thirds };
}

describe("resolveR32", () => {
  it("fills all 16 ties from the qualifier set", () => {
    const ties = resolveR32(qualifiers());
    expect(ties.size).toBe(16);
    expect(ties.get("R32-1")).toEqual({ homeTeamId: "1A", awayTeamId: "T0" });
    expect(ties.get("R32-9")).toEqual({ homeTeamId: "1I", awayTeamId: "2A" });
    expect(ties.get("R32-16")).toEqual({ homeTeamId: "2K", awayTeamId: "2L" });
  });

  it("places each qualifier exactly once", () => {
    const ties = [...resolveR32(qualifiers()).values()];
    const all = ties.flatMap((t) => [t.homeTeamId, t.awayTeamId]);
    expect(new Set(all).size).toBe(32);
  });
});
