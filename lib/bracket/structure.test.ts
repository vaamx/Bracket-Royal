import { describe, it, expect } from "vitest";
import { KNOCKOUT_MATCHES, KNOCKOUT_BY_ID, stageMatchIds } from "@/lib/bracket/structure";

describe("knockout structure", () => {
  it("has 32 matches: 16 R32, 8 R16, 4 QF, 2 SF, 1 final, 1 third", () => {
    expect(KNOCKOUT_MATCHES).toHaveLength(32);
    expect(stageMatchIds("r32")).toHaveLength(16);
    expect(stageMatchIds("r16")).toHaveLength(8);
    expect(stageMatchIds("qf")).toHaveLength(4);
    expect(stageMatchIds("sf")).toHaveLength(2);
    expect(stageMatchIds("final")).toHaveLength(1);
    expect(stageMatchIds("third")).toHaveLength(1);
  });

  it("uses every group winner and runner once across R32, plus 8 thirds", () => {
    const r32 = KNOCKOUT_MATCHES.filter((m) => m.stage === "r32");
    const specs = r32.flatMap((m) => [m.home!, m.away!]);
    expect(specs).toHaveLength(32);
    const winners = specs.filter((s) => s.kind === "winner").map((s) => (s as { group: string }).group).sort();
    const runners = specs.filter((s) => s.kind === "runner").map((s) => (s as { group: string }).group).sort();
    const thirds = specs.filter((s) => s.kind === "third");
    expect(winners).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L"]);
    expect(runners).toEqual(["A","B","C","D","E","F","G","H","I","J","K","L"]);
    expect(thirds).toHaveLength(8); // 8 third-place slots, each with an eligible-group cluster
    for (const s of thirds) expect((s as { cluster: string[] }).cluster.length).toBeGreaterThan(0);
  });

  it("wires every non-terminal match's winner into a valid later slot", () => {
    for (const m of KNOCKOUT_MATCHES) {
      if (m.stage === "final" || m.stage === "third") {
        expect(m.winnerTo).toBeNull();
      } else {
        expect(m.winnerTo).not.toBeNull();
        expect(KNOCKOUT_BY_ID.has(m.winnerTo!.matchId)).toBe(true);
      }
    }
  });

  it("drops both semifinal losers into the third-place playoff", () => {
    const sf = KNOCKOUT_MATCHES.filter((m) => m.stage === "sf");
    expect(sf.every((m) => m.loserTo?.matchId === "3RD-1")).toBe(true);
  });

  it("is a valid bracket: every downstream slot is fed exactly once (no collisions, no orphans)", () => {
    // Collect every (matchId, side) feed from winners + semifinal losers.
    const feeds: string[] = [];
    for (const m of KNOCKOUT_MATCHES) {
      if (m.winnerTo) feeds.push(`${m.winnerTo.matchId}:${m.winnerTo.side}`);
      if (m.loserTo) feeds.push(`${m.loserTo.matchId}:${m.loserTo.side}`);
    }
    // No slot is fed twice.
    expect(new Set(feeds).size).toBe(feeds.length);
    // Every non-R32 match's two slots (home+away) are both fed: R16(8)+QF(4)+SF(2)+F(1)+3RD(1) = 16 matches × 2 = 32.
    const downstream = KNOCKOUT_MATCHES.filter((m) => m.stage !== "r32");
    const expected = downstream.flatMap((m) => [`${m.id}:home`, `${m.id}:away`]).sort();
    expect([...feeds].sort()).toEqual(expected);
  });
});
