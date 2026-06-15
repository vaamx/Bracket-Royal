import type { KnockoutMatch, SlotSpec } from "@/lib/bracket/types";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

// The 16 R32 ties (home/away qualifier specs). Uses each group winner (1A–1L)
// and runner-up (2A–2L) once, plus the 8 best thirds (seeds 0–7).
// House layout (deterministic; not the official FIFA routing — see plan scope note).
const R32_TEMPLATE: Array<[SlotSpec, SlotSpec]> = [
  [{ kind: "winner", group: "A" }, { kind: "third", seed: 0 }],
  [{ kind: "winner", group: "B" }, { kind: "third", seed: 1 }],
  [{ kind: "winner", group: "C" }, { kind: "third", seed: 2 }],
  [{ kind: "winner", group: "D" }, { kind: "third", seed: 3 }],
  [{ kind: "winner", group: "E" }, { kind: "third", seed: 4 }],
  [{ kind: "winner", group: "F" }, { kind: "third", seed: 5 }],
  [{ kind: "winner", group: "G" }, { kind: "third", seed: 6 }],
  [{ kind: "winner", group: "H" }, { kind: "third", seed: 7 }],
  [{ kind: "winner", group: "I" }, { kind: "runner", group: "A" }],
  [{ kind: "winner", group: "J" }, { kind: "runner", group: "B" }],
  [{ kind: "winner", group: "K" }, { kind: "runner", group: "C" }],
  [{ kind: "winner", group: "L" }, { kind: "runner", group: "D" }],
  [{ kind: "runner", group: "E" }, { kind: "runner", group: "F" }],
  [{ kind: "runner", group: "G" }, { kind: "runner", group: "H" }],
  [{ kind: "runner", group: "I" }, { kind: "runner", group: "J" }],
  [{ kind: "runner", group: "K" }, { kind: "runner", group: "L" }],
];

/** Build the full 32-match knockout structure with the feeds tree. */
function build(): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // R32: winner of R32-(2j-1) -> R16-j home, R32-(2j) -> R16-j away
  R32_TEMPLATE.forEach(([home, away], i) => {
    const n = i + 1;
    const r16 = Math.ceil(n / 2);
    matches.push({
      id: `R32-${n}`, stage: "r32", home, away,
      winnerTo: { matchId: `R16-${r16}`, side: n % 2 === 1 ? "home" : "away" },
    });
  });

  // R16 (8): winner of R16-(2j-1) -> QF-j home, R16-(2j) -> QF-j away
  for (let n = 1; n <= 8; n++) {
    const qf = Math.ceil(n / 2);
    matches.push({
      id: `R16-${n}`, stage: "r16",
      winnerTo: { matchId: `QF-${qf}`, side: n % 2 === 1 ? "home" : "away" },
    });
  }

  // QF (4): winner of QF-(2j-1) -> SF-j home, QF-(2j) -> SF-j away
  for (let n = 1; n <= 4; n++) {
    const sf = Math.ceil(n / 2);
    matches.push({
      id: `QF-${n}`, stage: "qf",
      winnerTo: { matchId: `SF-${sf}`, side: n % 2 === 1 ? "home" : "away" },
    });
  }

  // SF (2): winner -> Final; loser -> third-place playoff
  matches.push({ id: "SF-1", stage: "sf", winnerTo: { matchId: "F-1", side: "home" }, loserTo: { matchId: "3RD-1", side: "home" } });
  matches.push({ id: "SF-2", stage: "sf", winnerTo: { matchId: "F-1", side: "away" }, loserTo: { matchId: "3RD-1", side: "away" } });

  matches.push({ id: "F-1", stage: "final", winnerTo: null });
  matches.push({ id: "3RD-1", stage: "third", winnerTo: null });

  return matches;
}

export const KNOCKOUT_MATCHES: KnockoutMatch[] = build();
export const KNOCKOUT_BY_ID: Map<string, KnockoutMatch> = new Map(KNOCKOUT_MATCHES.map((m) => [m.id, m]));
export { GROUPS };

/** Match ids for a given stage, in order. */
export function stageMatchIds(stage: KnockoutMatch["stage"]): string[] {
  return KNOCKOUT_MATCHES.filter((m) => m.stage === stage).map((m) => m.id);
}
