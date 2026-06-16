import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTENDER_NAMES = [
  "Kylian Mbappé", "Erling Haaland", "Harry Kane", "Lionel Messi", "Vinícius Júnior",
  "Lautaro Martínez", "Julián Álvarez", "Bukayo Saka", "Phil Foden", "Jude Bellingham",
  "Cristiano Ronaldo", "Rafael Leão", "Victor Osimhen", "Mohamed Salah", "Lamine Yamal",
  "Antoine Griezmann", "Ousmane Dembélé", "Florian Wirtz", "Kai Havertz",
  "Memphis Depay", "Cody Gakpo", "Romelu Lukaku", "Dušan Vlahović", "Christian Pulisic",
];
const CONTENDERS = new Set(CONTENDER_NAMES);

interface FdSquadTeam { tla: string | null; name?: string; squad?: Array<{ id: number | null; name: string; position?: string | null }> }
interface FdTeamsPayload { teams?: FdSquadTeam[] }

export interface PlayerRow { id: string; name: string; team_id: string; position: string | null; is_contender: boolean; }

/**
 * Flatten squads into player rows. `resolveTeamId(tla, name)` maps the feed's
 * team tla to our `teams.id`; football-data sometimes uses a different code than
 * we stored (e.g. URU vs URY), so the caller resolves by name as a fallback.
 * Teams (and their players) that can't be resolved are skipped.
 */
export function toPlayerRows(
  payload: FdTeamsPayload,
  resolveTeamId: (tla: string, name: string) => string | null = (tla) => tla
): PlayerRow[] {
  const out: PlayerRow[] = [];
  for (const t of payload.teams ?? []) {
    if (!t.tla) continue;
    const teamId = resolveTeamId(t.tla, t.name ?? "");
    if (!teamId) continue;
    for (const p of t.squad ?? []) {
      if (p.id == null) continue;
      out.push({ id: String(p.id), name: p.name, team_id: teamId, position: p.position ?? null, is_contender: CONTENDERS.has(p.name) });
    }
  }
  return out;
}

interface FdScorersPayload { scorers?: Array<{ player: { id: number | null }; goals: number | null }> }
export interface ScorerGoalRow { id: string; goals: number; scorer_rank: number }

export function parseScorerGoals(payload: FdScorersPayload): ScorerGoalRow[] {
  const out: ScorerGoalRow[] = [];
  (payload.scorers ?? []).forEach((s, i) => {
    if (s.player?.id == null) return;
    out.push({ id: String(s.player.id), goals: s.goals ?? 0, scorer_rank: i + 1 });
  });
  return out;
}

async function fdGet(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("Missing FOOTBALL_DATA_API_KEY");
  const res = await fetchImpl(`https://api.football-data.org/v4/competitions/WC/${path}`, { headers: { "X-Auth-Token": key } });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return res.json();
}

export async function ingestPlayers(admin: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<{ players: number }> {
  const payload = (await fdGet("teams", fetchImpl)) as FdTeamsPayload;

  // Resolve feed team codes to our teams.id: keep the tla when it's a real id,
  // else map by team name (handles URU→URY-style code differences).
  const { data: teams } = await admin.from("teams").select("id, name");
  const validIds = new Set((teams ?? []).map((t) => t.id as string));
  const idByName = new Map((teams ?? []).map((t) => [t.name as string, t.id as string]));
  const resolveTeamId = (tla: string, name: string): string | null =>
    validIds.has(tla) ? tla : idByName.get(name) ?? null;

  const rows = toPlayerRows(payload, resolveTeamId);
  if (rows.length) {
    const { error } = await admin.from("players").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  return { players: rows.length };
}

export async function refreshScorerGoals(admin: SupabaseClient, fetchImpl: typeof fetch = fetch): Promise<{ updated: number }> {
  const payload = (await fdGet("scorers?limit=30", fetchImpl)) as FdScorersPayload;
  const rows = parseScorerGoals(payload);
  for (const r of rows) {
    const { error } = await admin.from("players").update({ goals: r.goals, scorer_rank: r.scorer_rank }).eq("id", r.id);
    if (error) throw error;
  }
  return { updated: rows.length };
}
