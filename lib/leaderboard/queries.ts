import { createClient } from "@/lib/supabase/server";
import { sortStandingRows, type StandingRow, type LeagueHeader } from "@/lib/leaderboard/types";

export { sortStandingRows };
export type { StandingRow, LeagueHeader };

/**
 * The league header + a row for EVERY member (not just scored ones), so people
 * see themselves the moment they join — points/rank come from standings when
 * they exist, else 0. memberCount is the true number of members.
 */
export async function getLeaderboard(
  leagueId: string
): Promise<{ league: LeagueHeader; rows: StandingRow[]; memberCount: number } | null> {
  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues").select("id, name, invite_code, is_global").eq("id", leagueId).single();
  if (!league) return null;

  const { data: members } = await supabase
    .from("league_members").select("user_id").eq("league_id", leagueId);
  const userIds = (members ?? []).map((m) => m.user_id);

  const [{ data: profiles }, { data: standings }] = await Promise.all([
    userIds.length ? supabase.from("profiles").select("id, display_name").in("id", userIds) : Promise.resolve({ data: [] }),
    supabase.from("league_standings").select("user_id, points, rank, exact_count").eq("league_id", leagueId),
  ]);

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
  const standByUser = new Map((standings ?? []).map((s) => [s.user_id, s]));

  const rows = sortStandingRows(
    userIds.map((uid) => {
      const s = standByUser.get(uid);
      return {
        userId: uid,
        displayName: nameById.get(uid) ?? null,
        points: s?.points ?? 0,
        rank: s?.rank ?? null,
        exactCount: s?.exact_count ?? 0,
      };
    })
  );

  return {
    league: { id: league.id, name: league.name, inviteCode: league.invite_code, isGlobal: league.is_global },
    rows,
    memberCount: userIds.length,
  };
}
