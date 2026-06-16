import { createClient } from "@/lib/supabase/server";

export interface LeagueSummary {
  id: string;
  name: string;
  invite_code: string;
  is_global: boolean;
}

export interface LeagueCard extends LeagueSummary {
  memberCount: number;
  myPoints: number;
  myRank: number | null;
}

/**
 * Leagues the user belongs to, enriched with each league's member count and the
 * user's own points/rank — so the Leagues screen can show standing at a glance.
 * Global first, then by name.
 */
export async function getMyLeaguesDetailed(): Promise<LeagueCard[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships, error } = await supabase
    .from("league_members")
    .select("leagues(id, name, invite_code, is_global)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  const base = (memberships ?? [])
    .map((row) => row.leagues as unknown as LeagueSummary)
    .filter(Boolean);
  const ids = base.map((l) => l.id);
  if (ids.length === 0) return [];

  // One query each for member rows (visible via RLS for leagues you're in) and the
  // user's own standings rows. Counts/lookups are assembled in memory.
  const [{ data: allMembers }, { data: myStandings }] = await Promise.all([
    supabase.from("league_members").select("league_id").in("league_id", ids),
    supabase.from("league_standings").select("league_id, points, rank").eq("user_id", user.id).in("league_id", ids),
  ]);

  const counts = new Map<string, number>();
  for (const m of allMembers ?? []) counts.set(m.league_id, (counts.get(m.league_id) ?? 0) + 1);
  const standings = new Map((myStandings ?? []).map((s) => [s.league_id, s]));

  return base
    .map((l) => {
      const s = standings.get(l.id);
      return {
        ...l,
        memberCount: counts.get(l.id) ?? 1,
        myPoints: s?.points ?? 0,
        myRank: s?.rank ?? null,
      };
    })
    .sort((a, b) => Number(b.is_global) - Number(a.is_global) || a.name.localeCompare(b.name));
}

export interface MyStanding {
  points: number;
  rank: number | null;
  exactCount: number;
  memberCount: number;
  leagueId: string | null;
}

/**
 * The signed-in user's standing in the GLOBAL league — their headline points,
 * rank, and exact-score count — so we can show "your score" anywhere (header
 * pill, profile hero). Cheap: at most three indexed lookups. Zeros when the
 * user hasn't been scored yet (new tournament / no predictions).
 */
export async function getMyGlobalStanding(): Promise<MyStanding> {
  const empty: MyStanding = { points: 0, rank: null, exactCount: 0, memberCount: 0, leagueId: null };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: league } = await supabase
    .from("leagues").select("id").eq("is_global", true).maybeSingle();
  if (!league) return empty;

  const [{ data: standing }, { count }] = await Promise.all([
    supabase
      .from("league_standings").select("points, rank, exact_count")
      .eq("league_id", league.id).eq("user_id", user.id).maybeSingle(),
    supabase
      .from("league_members").select("user_id", { count: "exact", head: true })
      .eq("league_id", league.id),
  ]);

  return {
    points: standing?.points ?? 0,
    rank: standing?.rank ?? null,
    exactCount: standing?.exact_count ?? 0,
    memberCount: count ?? 0,
    leagueId: league.id,
  };
}

/** The signed-in user's profile, or null if unauthenticated. */
export async function getSessionProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  return data;
}
