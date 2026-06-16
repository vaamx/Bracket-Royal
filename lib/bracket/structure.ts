import type { KnockoutMatch, SlotSpec, Feed } from "@/lib/bracket/types";

const GROUPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const W = (g: string): SlotSpec => ({ kind: "winner", group: g });
const R = (g: string): SlotSpec => ({ kind: "runner", group: g });
const T = (cluster: string): SlotSpec => ({ kind: "third", cluster: cluster.split("") });

// Official 2026 Round of 32 (matches 73–88 → R32-1..16): home/away qualifier specs.
// Third-place slots carry the cluster of groups they may draw from (FIFA's table).
const R32_TEMPLATE: Array<[SlotSpec, SlotSpec]> = [
  [R("A"), R("B")],      // R32-1  (M73)
  [W("E"), T("ABCDF")],  // R32-2  (M74)
  [W("F"), R("C")],      // R32-3  (M75)
  [W("C"), R("F")],      // R32-4  (M76)
  [W("I"), T("CDFGH")],  // R32-5  (M77)
  [R("E"), R("I")],      // R32-6  (M78)
  [W("A"), T("CEFHI")],  // R32-7  (M79)
  [W("L"), T("EHIJK")],  // R32-8  (M80)
  [W("D"), T("BEFIJ")],  // R32-9  (M81)
  [W("G"), T("AEHIJ")],  // R32-10 (M82)
  [R("K"), R("L")],      // R32-11 (M83)
  [W("H"), R("J")],      // R32-12 (M84)
  [W("B"), T("EFGIJ")],  // R32-13 (M85)
  [W("J"), R("H")],      // R32-14 (M86)
  [W("K"), T("DEIJL")],  // R32-15 (M87)
  [R("D"), R("G")],      // R32-16 (M88)
];

// Official feeds: [homeFeederIndex, awayFeederIndex] (1-based) into each next-round match.
const R16_FEEDS: Array<[number, number]> = [
  [2, 5],   // R16-1 (M89) ← W74, W77
  [1, 3],   // R16-2 (M90) ← W73, W75
  [4, 6],   // R16-3 (M91) ← W76, W78
  [7, 8],   // R16-4 (M92) ← W79, W80
  [11, 12], // R16-5 (M93) ← W83, W84
  [9, 10],  // R16-6 (M94) ← W81, W82
  [14, 16], // R16-7 (M95) ← W86, W88
  [13, 15], // R16-8 (M96) ← W85, W87
];
const QF_FEEDS: Array<[number, number]> = [
  [1, 2], // QF-1 (M97)  ← R16-1, R16-2
  [5, 6], // QF-2 (M98)  ← R16-5, R16-6
  [3, 4], // QF-3 (M99)  ← R16-3, R16-4
  [7, 8], // QF-4 (M100) ← R16-7, R16-8
];
const SF_FEEDS: Array<[number, number]> = [
  [1, 2], // SF-1 (M101) ← QF-1, QF-2
  [3, 4], // SF-2 (M102) ← QF-3, QF-4
];

/** Build the full 32-match knockout structure with the official feeds tree. */
function build(): KnockoutMatch[] {
  const byId = new Map<string, KnockoutMatch>();
  const make = (id: string, stage: KnockoutMatch["stage"], extra: Partial<KnockoutMatch> = {}) => {
    byId.set(id, { id, stage, winnerTo: null, ...extra });
  };

  R32_TEMPLATE.forEach(([home, away], i) => make(`R32-${i + 1}`, "r32", { home, away }));
  for (let n = 1; n <= 8; n++) make(`R16-${n}`, "r16");
  for (let n = 1; n <= 4; n++) make(`QF-${n}`, "qf");
  make("SF-1", "sf");
  make("SF-2", "sf");
  make("F-1", "final");
  make("3RD-1", "third");

  const wire = (feeds: Array<[number, number]>, fromPrefix: string, toPrefix: string) => {
    feeds.forEach(([h, a], k) => {
      const target = `${toPrefix}-${k + 1}`;
      byId.get(`${fromPrefix}-${h}`)!.winnerTo = { matchId: target, side: "home" };
      byId.get(`${fromPrefix}-${a}`)!.winnerTo = { matchId: target, side: "away" };
    });
  };
  wire(R16_FEEDS, "R32", "R16");
  wire(QF_FEEDS, "R16", "QF");
  wire(SF_FEEDS, "QF", "SF");

  // Semifinals: winners → final, losers → third-place playoff.
  const sf1 = byId.get("SF-1")!;
  const sf2 = byId.get("SF-2")!;
  sf1.winnerTo = { matchId: "F-1", side: "home" } as Feed;
  sf2.winnerTo = { matchId: "F-1", side: "away" } as Feed;
  sf1.loserTo = { matchId: "3RD-1", side: "home" };
  sf2.loserTo = { matchId: "3RD-1", side: "away" };

  // Stable topological order (R32 → R16 → QF → SF → F → 3RD).
  const order = ["r32", "r16", "qf", "sf", "final", "third"] as const;
  return [...byId.values()].sort(
    (x, y) => order.indexOf(x.stage) - order.indexOf(y.stage) || x.id.localeCompare(y.id, undefined, { numeric: true })
  );
}

export const KNOCKOUT_MATCHES: KnockoutMatch[] = build();
export const KNOCKOUT_BY_ID: Map<string, KnockoutMatch> = new Map(KNOCKOUT_MATCHES.map((m) => [m.id, m]));
export { GROUPS };

/** Match ids for a given stage, in order. */
export function stageMatchIds(stage: KnockoutMatch["stage"]): string[] {
  return KNOCKOUT_MATCHES.filter((m) => m.stage === stage).map((m) => m.id);
}

/** The third-place slots (matchId, side, allowed cluster), in R32 match order. */
export function thirdSlotClusters(): { matchId: string; side: "home" | "away"; cluster: string[] }[] {
  const out: { matchId: string; side: "home" | "away"; cluster: string[] }[] = [];
  for (const m of KNOCKOUT_MATCHES) {
    if (m.stage !== "r32") continue;
    if (m.home?.kind === "third") out.push({ matchId: m.id, side: "home", cluster: m.home.cluster });
    if (m.away?.kind === "third") out.push({ matchId: m.id, side: "away", cluster: m.away.cluster });
  }
  return out;
}
