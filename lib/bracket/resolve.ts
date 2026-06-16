import { computeGroupStandings, rankThirdPlaceTeams } from "@/lib/math";
import type { PlayedMatch, TiebreakInputs, TeamStanding } from "@/lib/math";
import { KNOCKOUT_MATCHES, thirdSlotClusters } from "@/lib/bracket/structure";
import type { SlotSpec } from "@/lib/bracket/types";

export interface ThirdQualifier {
  teamId: string;
  group: string;
}
export interface Qualifiers {
  winners: Record<string, string>; // group -> teamId (1st)
  runners: Record<string, string>; // group -> teamId (2nd)
  thirds: ThirdQualifier[];        // 8 best thirds (with their group), best first
}

export interface ResolvedTie {
  homeTeamId: string;
  awayTeamId: string;
}

interface GroupMatch extends PlayedMatch {
  group: string;
}
interface QualTeam {
  id: string;
  group: string;
  fifaRank: number;
}

/** Compute winners, runners, and the 8 best thirds (with group) from final group results. */
export function computeQualifiers(matches: GroupMatch[], teams: QualTeam[]): Qualifiers {
  const groups = [...new Set(teams.map((t) => t.group))];
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  const thirdRows: TeamStanding[] = [];
  const groupOfThird = new Map<string, string>();

  for (const g of groups) {
    const gm = matches.filter((m) => m.group === g);
    const gt = teams.filter((t) => t.group === g);
    const tb: TiebreakInputs = { fifaRank: Object.fromEntries(gt.map((t) => [t.id, t.fifaRank])) };
    const table = computeGroupStandings(gm, tb);
    if (table[0]) winners[g] = table[0].teamId;
    if (table[1]) runners[g] = table[1].teamId;
    if (table[2]) {
      thirdRows.push(table[2]);
      groupOfThird.set(table[2].teamId, g);
    }
  }

  const thirds = rankThirdPlaceTeams(thirdRows, 8).map((r) => ({ teamId: r.teamId, group: groupOfThird.get(r.teamId)! }));
  return { winners, runners, thirds };
}

/**
 * Assign the 8 best thirds to the 8 third-place R32 slots, respecting each slot's
 * eligible-group cluster (FIFA's combination table). Returns matchId:side -> teamId.
 * Uses bipartite matching (augmenting paths) — a valid assignment always exists for
 * a legal set of qualifying groups. Deterministic by slot/third order.
 */
export function assignThirds(thirds: ThirdQualifier[]): Map<string, string> {
  const slots = thirdSlotClusters(); // 8 slots, fixed order
  const n = slots.length;
  const slotOfThird: number[] = new Array(thirds.length).fill(-1); // third index -> slot index
  const thirdOfSlot: number[] = new Array(n).fill(-1);             // slot index -> third index

  const tryAssign = (slotIdx: number, seen: boolean[]): boolean => {
    const cluster = new Set(slots[slotIdx].cluster);
    for (let t = 0; t < thirds.length; t++) {
      if (seen[t] || !cluster.has(thirds[t].group)) continue;
      seen[t] = true;
      if (slotOfThird[t] === -1 || tryAssign(slotOfThird[t], seen)) {
        slotOfThird[t] = slotIdx;
        thirdOfSlot[slotIdx] = t;
        return true;
      }
    }
    return false;
  };

  for (let s = 0; s < n; s++) tryAssign(s, new Array(thirds.length).fill(false));

  const out = new Map<string, string>();
  slots.forEach((slot, s) => {
    const t = thirdOfSlot[s];
    if (t >= 0) out.set(`${slot.matchId}:${slot.side}`, thirds[t].teamId);
  });
  return out;
}

/** Fill the 16 R32 ties from a qualifier set (winners/runners directly, thirds via the combination). */
export function resolveR32(q: Qualifiers): Map<string, ResolvedTie> {
  const thirdByKey = assignThirds(q.thirds);
  const pick = (spec: SlotSpec, matchId: string, side: "home" | "away"): string => {
    if (spec.kind === "winner") return q.winners[spec.group];
    if (spec.kind === "runner") return q.runners[spec.group];
    return thirdByKey.get(`${matchId}:${side}`)!;
  };
  const out = new Map<string, ResolvedTie>();
  for (const m of KNOCKOUT_MATCHES) {
    if (m.stage !== "r32") continue;
    out.set(m.id, { homeTeamId: pick(m.home!, m.id, "home"), awayTeamId: pick(m.away!, m.id, "away") });
  }
  return out;
}
