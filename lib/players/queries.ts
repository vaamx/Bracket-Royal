import { createClient } from "@/lib/supabase/server";

export interface PlayerLite { id: string; name: string; teamId: string | null; flag: string | null; goals: number; scorerRank: number | null; }

async function withFlags(rows: { id: string; name: string; team_id: string | null; goals: number; scorer_rank: number | null }[]): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const teamIds = [...new Set(rows.map((r) => r.team_id).filter(Boolean))] as string[];
  const flagByTeam = new Map<string, string | null>();
  if (teamIds.length) {
    const { data: teams } = await supabase.from("teams").select("id, flag").in("id", teamIds);
    for (const t of teams ?? []) flagByTeam.set(t.id, t.flag);
  }
  return rows.map((r) => ({ id: r.id, name: r.name, teamId: r.team_id, flag: r.team_id ? flagByTeam.get(r.team_id) ?? null : null, goals: r.goals, scorerRank: r.scorer_rank }));
}

export async function searchPlayers(q: string): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const term = q.trim();
  if (term.length < 2) return [];
  const { data } = await supabase.rpc("search_players", { q: term });
  return withFlags((data ?? []) as { id: string; name: string; team_id: string | null; goals: number; scorer_rank: number | null }[]);
}

export async function getContenders(): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").eq("is_contender", true).order("name").limit(30);
  return withFlags(data ?? []);
}

export async function getMyScorerBoard(): Promise<{ picks: PlayerLite[]; bootId: string | null; bootGoals: number | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { picks: [], bootId: null, bootGoals: null };
  const { data: preds } = await supabase.from("scorer_predictions").select("player_id, is_golden_boot, predicted_goals").eq("user_id", user.id);
  const ids = (preds ?? []).map((p) => p.player_id);
  let picks: PlayerLite[] = [];
  if (ids.length) {
    const { data: rows } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").in("id", ids);
    picks = await withFlags(rows ?? []);
  }
  const boot = (preds ?? []).find((p) => p.is_golden_boot);
  return { picks, bootId: boot?.player_id ?? null, bootGoals: boot?.predicted_goals ?? null };
}

export async function getActualTop10(): Promise<PlayerLite[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("players").select("id, name, team_id, goals, scorer_rank").not("scorer_rank", "is", null).order("scorer_rank").limit(10);
  return withFlags(data ?? []);
}

export async function scorersLocked(): Promise<boolean> {
  const supabase = await createClient();
  const { data: ko } = await supabase.from("matches").select("status, lock_at").in("stage", ["r32", "r16", "qf", "sf", "final", "third"]);
  const now = Date.now();
  return (ko ?? []).some((m) => m.status === "final" || m.status === "live" || (m.lock_at !== null && new Date(m.lock_at).getTime() <= now));
}

export interface PlayerProfile {
  id: string; name: string; teamId: string | null; teamName: string | null; flag: string | null;
  position: string | null; goals: number; scorerRank: number | null;
  inMyTop10: boolean; isMyGoldenBoot: boolean;
}

export async function getPlayerProfile(id: string): Promise<PlayerProfile | null> {
  const supabase = await createClient();
  const { data: p } = await supabase.from("players").select("id, name, team_id, position, goals, scorer_rank").eq("id", id).maybeSingle();
  if (!p) return null;
  let teamName: string | null = null, flag: string | null = null;
  if (p.team_id) {
    const { data: team } = await supabase.from("teams").select("name, flag").eq("id", p.team_id).maybeSingle();
    teamName = team?.name ?? null; flag = team?.flag ?? null;
  }
  let inMyTop10 = false, isMyGoldenBoot = false;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: pick } = await supabase.from("scorer_predictions").select("is_golden_boot").eq("user_id", user.id).eq("player_id", id).maybeSingle();
    if (pick) { inMyTop10 = true; isMyGoldenBoot = pick.is_golden_boot; }
  }
  return { id: p.id, name: p.name, teamId: p.team_id, teamName, flag, position: p.position, goals: p.goals, scorerRank: p.scorer_rank, inMyTop10, isMyGoldenBoot };
}
