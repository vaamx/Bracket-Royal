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
  rows.sort((a, b) => b.points - a.points);

  const result: TeamStanding[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].points === rows[i].points) j++;
    const tiedGroup = rows.slice(i, j);
    if (tiedGroup.length === 1) {
      result.push(tiedGroup[0]);
    } else {
      result.push(...resolveTies(tiedGroup, matches));
    }
    i = j;
  }
  return result;
}

function resolveTies(tied: TeamStanding[], allMatches: PlayedMatch[]): TeamStanding[] {
  const tiedIds = new Set(tied.map((r) => r.teamId));
  // Mini-table over matches played ONLY between the currently tied teams.
  const h2hMatches = allMatches.filter(
    (m) => tiedIds.has(m.homeTeamId) && tiedIds.has(m.awayTeamId)
  );
  const h2h = buildRows(h2hMatches);

  const cmp = (a: TeamStanding, b: TeamStanding): number => {
    const ha = h2h.get(a.teamId);
    const hb = h2h.get(b.teamId);
    // (1) head-to-head points
    const hp = (hb?.points ?? 0) - (ha?.points ?? 0);
    if (hp !== 0) return hp;
    // (2) head-to-head goal difference
    const hgd = (hb?.goalDifference ?? 0) - (ha?.goalDifference ?? 0);
    if (hgd !== 0) return hgd;
    // (3) head-to-head goals scored
    const hgf = (hb?.goalsFor ?? 0) - (ha?.goalsFor ?? 0);
    if (hgf !== 0) return hgf;
    // (4) overall goal difference
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    // (5) overall goals scored
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    // (6) conduct score (higher = worse, ascending)
    if (a.conduct !== b.conduct) return a.conduct - b.conduct;
    // (7) FIFA World Ranking (lower = better, ascending).
    // Compare order-wise so two unranked teams (both +Infinity) yield 0
    // rather than NaN, which would defeat the still-tied detection below.
    if (a.fifaRank < b.fifaRank) return -1;
    if (a.fifaRank > b.fifaRank) return 1;
    return 0;
  };

  const sorted = [...tied].sort(cmp);

  // Re-apply the criteria to any subset that is STILL tied, per FIFA rules.
  // Only recurse when the still-tied run is strictly smaller than the input,
  // which guarantees termination.
  const result: TeamStanding[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    const run = sorted.slice(i, j);
    if (run.length > 1 && run.length < tied.length) {
      result.push(...resolveTies(run, allMatches));
    } else {
      result.push(...run);
    }
    i = j;
  }
  return result;
}
