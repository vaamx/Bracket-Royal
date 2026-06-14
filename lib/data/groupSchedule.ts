export interface GeneratedMatch {
  id: string;
  stage: "group";
  group_label: string;
  home_team_id: string;
  away_team_id: string;
  matchday: number;
}

/**
 * Build the 6 round-robin matches for a group of exactly 4 teams.
 * Pairing order (teams indexed 0..3) is fixed so ids are deterministic:
 *   MD1: 0-1, 2-3   MD2: 0-2, 1-3   MD3: 0-3, 1-2
 * Match id = `G{group}-{home}-{away}`.
 */
export function buildGroupMatches(group: string, teamIds: string[]): GeneratedMatch[] {
  if (teamIds.length !== 4) {
    throw new Error(`Group ${group} must have exactly 4 teams, got ${teamIds.length}`);
  }
  const [a, b, c, d] = teamIds;
  const pairs: Array<[string, string, number]> = [
    [a, b, 1], [c, d, 1],
    [a, c, 2], [b, d, 2],
    [a, d, 3], [b, c, 3],
  ];
  return pairs.map(([home, away, matchday]) => ({
    id: `G${group}-${home}-${away}`,
    stage: "group" as const,
    group_label: group,
    home_team_id: home,
    away_team_id: away,
    matchday,
  }));
}
