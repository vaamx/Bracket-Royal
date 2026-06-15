import { createClient } from "@/lib/supabase/server";

export interface BracketTeam {
  name: string;
  flag: string | null;
}
export interface BracketMatchRow {
  id: string;
  stage: "r32" | "r16" | "qf" | "sf" | "final" | "third";
  homeTeamId: string | null;
  awayTeamId: string | null;
  lockAt: string | null;
  status: "scheduled" | "live" | "final";
  winnerTeamId: string | null;
}
export interface BracketData {
  resolved: boolean;                       // R32 teams populated yet?
  teams: Record<string, BracketTeam>;       // teamId -> display
  r32: Record<string, { homeTeamId: string | null; awayTeamId: string | null }>;
  matches: BracketMatchRow[];               // all 32 KO matches
  picks: Record<string, string>;            // matchId -> predicted winner teamId
  userId: string | null;
}

const KO_STAGES = ["r32", "r16", "qf", "sf", "final", "third"];

export async function getBracketData(): Promise<BracketData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: matchRows }, { data: teamRows }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, stage, home_team_id, away_team_id, lock_at, status, winner_team_id")
      .in("stage", KO_STAGES),
    supabase.from("teams").select("id, name, flag"),
  ]);

  const teams: Record<string, BracketTeam> = {};
  for (const t of teamRows ?? []) teams[t.id] = { name: t.name, flag: t.flag };

  const matches: BracketMatchRow[] = (matchRows ?? []).map((m) => ({
    id: m.id, stage: m.stage, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
    lockAt: m.lock_at, status: m.status, winnerTeamId: m.winner_team_id,
  }));

  const r32: BracketData["r32"] = {};
  for (const m of matches) {
    if (m.stage === "r32") r32[m.id] = { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId };
  }
  const resolved = Object.keys(r32).length > 0 && Object.values(r32).every((t) => t.homeTeamId && t.awayTeamId);

  let picks: Record<string, string> = {};
  if (user) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, predicted_winner_team_id")
      .eq("user_id", user.id)
      .not("predicted_winner_team_id", "is", null);
    picks = Object.fromEntries((preds ?? []).map((p) => [p.match_id, p.predicted_winner_team_id as string]));
  }

  return { resolved, teams, r32, matches, picks, userId: user?.id ?? null };
}
