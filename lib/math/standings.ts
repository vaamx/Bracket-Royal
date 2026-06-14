import type { PlayedMatch, TeamStanding, TiebreakInputs } from "@/lib/math/types";

function emptyRow(teamId: string, tb?: TiebreakInputs): TeamStanding {
  return {
    teamId, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    conduct: tb?.conduct?.[teamId] ?? 0,
    fifaRank: tb?.fifaRank?.[teamId] ?? Number.POSITIVE_INFINITY,
  };
}

function applyMatch(row: TeamStanding, gf: number, ga: number): void {
  row.played += 1;
  row.goalsFor += gf;
  row.goalsAgainst += ga;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  if (gf > ga) { row.won += 1; row.points += 3; }
  else if (gf === ga) { row.drawn += 1; row.points += 1; }
  else { row.lost += 1; }
}

function buildRows(matches: PlayedMatch[], tb?: TiebreakInputs): Map<string, TeamStanding> {
  const rows = new Map<string, TeamStanding>();
  const ensure = (id: string) => {
    if (!rows.has(id)) rows.set(id, emptyRow(id, tb));
    return rows.get(id)!;
  };
  for (const m of matches) {
    const home = ensure(m.homeTeamId);
    const away = ensure(m.awayTeamId);
    applyMatch(home, m.homeScore, m.awayScore);
    applyMatch(away, m.awayScore, m.homeScore);
  }
  return rows;
}

export function computeGroupStandings(matches: PlayedMatch[], tb?: TiebreakInputs): TeamStanding[] {
  const rows = [...buildRows(matches, tb).values()];
  return rows.sort((a, b) => b.points - a.points);
}
