export interface AchievementInput {
  groupMatches: {
    id: string;
    group_label: string | null;
    kickoff_at: string | null;
    home_score: number | null;
    away_score: number | null;
    status: string;
  }[];
  predictions: { match_id: string; predicted_home: number | null; predicted_away: number | null }[];
  finalWinnerTeamId?: string | null; // actual champion (F-1 winner)
  finalPickTeamId?: string | null;    // user's predicted champion (F-1 pick)
}

/** Derive earned badge keys + the user's longest exact-score streak. Pure. */
export function computeAchievements(input: AchievementInput): { badges: string[]; longestStreak: number } {
  const predBy = new Map(input.predictions.map((p) => [p.match_id, p]));
  const finals = input.groupMatches
    .filter((m) => m.status === "final" && m.home_score !== null && m.away_score !== null)
    .sort((a, b) => (a.kickoff_at ?? "").localeCompare(b.kickoff_at ?? ""));

  let exactTotal = 0;
  let cur = 0;
  let longestStreak = 0;
  const exactByGroup = new Map<string, number>();
  const finalsByGroup = new Map<string, number>();

  for (const m of finals) {
    if (m.group_label) finalsByGroup.set(m.group_label, (finalsByGroup.get(m.group_label) ?? 0) + 1);
    const p = predBy.get(m.id);
    const exact = !!p && p.predicted_home === m.home_score && p.predicted_away === m.away_score;
    if (exact) {
      exactTotal++;
      cur++;
      longestStreak = Math.max(longestStreak, cur);
      if (m.group_label) exactByGroup.set(m.group_label, (exactByGroup.get(m.group_label) ?? 0) + 1);
    } else {
      cur = 0;
    }
  }

  const badges: string[] = [];
  if (exactTotal >= 1) badges.push("bullseye");
  if (exactTotal >= 5) badges.push("sharpshooter");
  for (const [g, count] of finalsByGroup) {
    if (count === 6 && exactByGroup.get(g) === 6) {
      badges.push("perfect_group");
      break;
    }
  }
  if (longestStreak >= 3) badges.push("hot_streak");
  if (input.finalWinnerTeamId && input.finalPickTeamId && input.finalWinnerTeamId === input.finalPickTeamId) {
    badges.push("oracle");
  }
  return { badges, longestStreak };
}
