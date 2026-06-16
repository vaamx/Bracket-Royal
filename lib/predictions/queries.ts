import { createClient } from "@/lib/supabase/server";
import type { PredictGroup, PredictMatch, PredictTeam } from "@/lib/predictions/types";

/**
 * Load every group with its teams, its group matches, and merge in the
 * signed-in user's predictions. Returns groups ordered A..L.
 */
export async function getGroupsForPrediction(): Promise<PredictGroup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from("teams").select("id, name, flag, group_label, fifa_rank"),
    supabase
      .from("matches")
      .select("id, group_label, matchday, home_team_id, away_team_id, kickoff_at, lock_at, status, home_score, away_score")
      .eq("stage", "group"),
  ]);

  let predByMatch = new Map<string, { predicted_home: number | null; predicted_away: number | null }>();
  if (user) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, predicted_home, predicted_away")
      .eq("user_id", user.id);
    predByMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));
  }

  const groupLabels = [...new Set((teams ?? []).map((t) => t.group_label).filter(Boolean))].sort() as string[];

  return groupLabels.map((label) => {
    const groupTeams: PredictTeam[] = (teams ?? [])
      .filter((t) => t.group_label === label)
      .map((t) => ({ id: t.id, name: t.name, flag: t.flag, fifaRank: t.fifa_rank ?? 999 }))
      .sort((a, b) => a.fifaRank - b.fifaRank);

    const groupMatches: PredictMatch[] = (matches ?? [])
      .filter((m) => m.group_label === label)
      .sort((a, b) => (a.matchday ?? 0) - (b.matchday ?? 0) || a.id.localeCompare(b.id))
      .map((m) => {
        const p = predByMatch.get(m.id);
        return {
          id: m.id,
          matchday: m.matchday,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          kickoffAt: m.kickoff_at,
          lockAt: m.lock_at,
          status: m.status,
          homeScore: m.home_score,
          awayScore: m.away_score,
          predictedHome: p?.predicted_home ?? null,
          predictedAway: p?.predicted_away ?? null,
        };
      });

    return { label, teams: groupTeams, matches: groupMatches };
  });
}
