import { createClient } from "@/lib/supabase/server";

export interface StandingRow {
  userId: string;
  displayName: string;
  points: number;
  rank: number | null;
  exactCount: number;
}

export interface LeagueHeader {
  id: string;
  name: string;
  inviteCode: string;
  isGlobal: boolean;
}

/** The league header + its standings (joined with member display names), top first. */
export async function getLeaderboard(leagueId: string): Promise<{ league: LeagueHeader; rows: StandingRow[] } | null> {
  const supabase = await createClient();
  const { data: league } = await supabase
    .from("leagues").select("id, name, invite_code, is_global").eq("id", leagueId).single();
  if (!league) return null;

  const { data: standings } = await supabase
    .from("league_standings")
    .select("user_id, points, rank, exact_count, profiles(display_name)")
    .eq("league_id", leagueId)
    // Stable order: points, then exacts, then a deterministic id tiebreak — so the
    // SSR render and realtime refetches agree (no row jitter on ties).
    .order("points", { ascending: false })
    .order("exact_count", { ascending: false })
    .order("user_id", { ascending: true });

  const rows: StandingRow[] = (standings ?? []).map((s) => ({
    userId: s.user_id,
    displayName: (s.profiles as unknown as { display_name: string | null })?.display_name ?? "Guest",
    points: s.points,
    rank: s.rank,
    exactCount: s.exact_count,
  }));

  return {
    league: { id: league.id, name: league.name, inviteCode: league.invite_code, isGlobal: league.is_global },
    rows,
  };
}
