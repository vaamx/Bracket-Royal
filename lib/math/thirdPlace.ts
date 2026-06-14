import type { TeamStanding } from "@/lib/math/types";

export function rankThirdPlaceTeams(thirds: TeamStanding[], count = 8): TeamStanding[] {
  return [...thirds]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.conduct !== b.conduct) return a.conduct - b.conduct;
      // Sign-based to avoid Infinity - Infinity = NaN for two unranked teams.
      if (a.fifaRank < b.fifaRank) return -1;
      if (a.fifaRank > b.fifaRank) return 1;
      return 0;
    })
    .slice(0, count);
}
