import { computeGroupStandings, rankThirdPlaceTeams } from "@/lib/math";
import type { PlayedMatch, TiebreakInputs, TeamStanding } from "@/lib/math";
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";
import type { SlotSpec } from "@/lib/bracket/types";

export interface Qualifiers {
  winners: Record<string, string>; // group -> teamId (1st)
  runners: Record<string, string>; // group -> teamId (2nd)
  thirds: string[];                // 8 best-third teamIds, best first
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

/** Compute winners, runners, and the 8 best thirds from final group results. */
export function computeQualifiers(matches: GroupMatch[], teams: QualTeam[]): Qualifiers {
  const groups = [...new Set(teams.map((t) => t.group))];
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  const thirdRows: TeamStanding[] = [];

  for (const g of groups) {
    const gm = matches.filter((m) => m.group === g);
    const gt = teams.filter((t) => t.group === g);
    const tb: TiebreakInputs = { fifaRank: Object.fromEntries(gt.map((t) => [t.id, t.fifaRank])) };
    const table = computeGroupStandings(gm, tb);
    if (table[0]) winners[g] = table[0].teamId;
    if (table[1]) runners[g] = table[1].teamId;
    if (table[2]) thirdRows.push(table[2]);
  }

  const thirds = rankThirdPlaceTeams(thirdRows, 8).map((r) => r.teamId);
  return { winners, runners, thirds };
}

/** Fill the 16 R32 ties from a qualifier set. */
export function resolveR32(q: Qualifiers): Map<string, ResolvedTie> {
  const pick = (spec: SlotSpec): string => {
    if (spec.kind === "winner") return q.winners[spec.group];
    if (spec.kind === "runner") return q.runners[spec.group];
    return q.thirds[spec.seed];
  };
  const out = new Map<string, ResolvedTie>();
  for (const m of KNOCKOUT_MATCHES) {
    if (m.stage !== "r32") continue;
    out.set(m.id, { homeTeamId: pick(m.home!), awayTeamId: pick(m.away!) });
  }
  return out;
}
