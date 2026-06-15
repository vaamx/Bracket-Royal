import { describe, it, expect } from "vitest";
import { advanceActualBracket, type KOResult } from "@/lib/bracket/advance";

describe("advanceActualBracket", () => {
  it("places R32 winners into the correct R16 slots", () => {
    // R32-1 and R32-2 both feed R16-1 (home, away respectively).
    const results: KOResult[] = [
      { matchId: "R32-1", winnerTeamId: "1A", loserTeamId: "T0" },
      { matchId: "R32-2", winnerTeamId: "1B", loserTeamId: "T1" },
    ];
    const slots = advanceActualBracket(results);
    expect(slots.get("R16-1")).toEqual({ homeTeamId: "1A", awayTeamId: "1B" });
  });

  it("drops semifinal losers into the third-place match", () => {
    const results: KOResult[] = [
      { matchId: "SF-1", winnerTeamId: "1A", loserTeamId: "1B" },
      { matchId: "SF-2", winnerTeamId: "1C", loserTeamId: "1D" },
    ];
    const slots = advanceActualBracket(results);
    expect(slots.get("F-1")).toEqual({ homeTeamId: "1A", awayTeamId: "1C" });
    expect(slots.get("3RD-1")).toEqual({ homeTeamId: "1B", awayTeamId: "1D" });
  });

  it("ignores results for matches with no winner yet", () => {
    const slots = advanceActualBracket([]);
    expect(slots.size).toBe(0);
  });

  it("advances QF winners into the correct SF slots", () => {
    // QF-1 → SF-1 home, QF-2 → SF-1 away; QF-3 → SF-2 home, QF-4 → SF-2 away.
    const slots = advanceActualBracket([
      { matchId: "QF-1", winnerTeamId: "W1", loserTeamId: "L1" },
      { matchId: "QF-2", winnerTeamId: "W2", loserTeamId: "L2" },
      { matchId: "QF-3", winnerTeamId: "W3", loserTeamId: "L3" },
      { matchId: "QF-4", winnerTeamId: "W4", loserTeamId: "L4" },
    ]);
    expect(slots.get("SF-1")).toEqual({ homeTeamId: "W1", awayTeamId: "W2" });
    expect(slots.get("SF-2")).toEqual({ homeTeamId: "W3", awayTeamId: "W4" });
  });
});
