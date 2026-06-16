import { predictedStandings } from "@/lib/predictions/toStandings";
import { rankThirdPlaceTeams } from "@/lib/math";
import type { TeamStanding } from "@/lib/math";
import { resolveR32, type Qualifiers, type ThirdQualifier, type ResolvedTie } from "@/lib/bracket/resolve";

export interface PredGroupMatch {
  homeTeamId: string;
  awayTeamId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  predictedHome: number | null;
  predictedAway: number | null;
}
export interface PredGroup {
  label: string;
  teams: { id: string; fifaRank: number }[];
  matches: PredGroupMatch[];
}

/**
 * Build the user's PREDICTED Round of 32 from their group predictions: each group's
 * predicted table (already-played games count their real result; the rest use the
 * user's picks) yields a predicted winner/runner/third, the best 8 thirds are ranked,
 * and they're slotted into the official R32 structure. Lets a user fill their whole
 * bracket before the real groups finish; scored against reality as games are played.
 */
export function buildPredictedR32(groups: PredGroup[]): Map<string, ResolvedTie> {
  const winners: Record<string, string> = {};
  const runners: Record<string, string> = {};
  const thirdRows: TeamStanding[] = [];
  const groupOfThird = new Map<string, string>();

  for (const g of groups) {
    const table = predictedStandings(
      g.teams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
      g.matches.map((m) => {
        const final = m.status === "final" && m.homeScore !== null && m.awayScore !== null;
        return {
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          predicted_home: final ? m.homeScore : m.predictedHome,
          predicted_away: final ? m.awayScore : m.predictedAway,
        };
      })
    );
    if (table[0]) winners[g.label] = table[0].teamId;
    if (table[1]) runners[g.label] = table[1].teamId;
    if (table[2]) {
      thirdRows.push(table[2]);
      groupOfThird.set(table[2].teamId, g.label);
    }
  }

  const thirds: ThirdQualifier[] = rankThirdPlaceTeams(thirdRows, 8).map((r) => ({
    teamId: r.teamId,
    group: groupOfThird.get(r.teamId)!,
  }));
  const q: Qualifiers = { winners, runners, thirds };
  return resolveR32(q);
}
