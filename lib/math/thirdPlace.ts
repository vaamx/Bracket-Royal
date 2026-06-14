import type { TeamStanding } from "@/lib/math/types";

export function rankThirdPlaceTeams(thirds: TeamStanding[], count = 8): TeamStanding[] {
  return [...thirds]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.conduct !== b.conduct) return a.conduct - b.conduct;
      return a.fifaRank - b.fifaRank;
    })
    .slice(0, count);
}
