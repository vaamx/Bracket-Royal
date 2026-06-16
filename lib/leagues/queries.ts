import { createClient } from "@/lib/supabase/server";

export interface LeagueSummary {
  id: string;
  name: string;
  invite_code: string;
  is_global: boolean;
}

/** Leagues the signed-in user belongs to (global first, then by name). */
export async function getMyLeagues(): Promise<LeagueSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  // Must filter by the current user: RLS lets a member see every co-member row of
  // any league they belong to, so without this the global league returns one row
  // per member (duplicate "Global" entries).
  const { data, error } = await supabase
    .from("league_members")
    .select("leagues(id, name, invite_code, is_global)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const leagues = (data ?? [])
    .map((row) => row.leagues as unknown as LeagueSummary)
    .filter(Boolean);
  return leagues.sort((a, b) => Number(b.is_global) - Number(a.is_global) || a.name.localeCompare(b.name));
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
