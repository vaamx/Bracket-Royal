import { createClient } from "@/lib/supabase/server";
import { getGroupsForPrediction } from "@/lib/predictions/queries";
import { buildPredictedR32 } from "@/lib/bracket/predictedQualifiers";

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
  resolved: boolean;                       // is the R32 filled (always true once groups have teams)?
  mode: "predicted" | "actual";            // predicted = from the user's group picks; actual = real qualifiers
  seeded: boolean;                          // in predicted mode, are ALL groups predicted so the bracket can fill?
  groupsReady: number;                      // # of groups fully predicted-or-final
  groupsTotal: number;                      // # of groups total
  teams: Record<string, BracketTeam>;       // teamId -> display
  r32: Record<string, { homeTeamId: string | null; awayTeamId: string | null }>;
  matches: BracketMatchRow[];               // all 32 KO matches (for lock/status)
  picks: Record<string, string>;            // matchId -> predicted winner teamId
  userId: string | null;
}

const KO_STAGES = ["r32", "r16", "qf", "sf", "final", "third"];

export async function getBracketData(): Promise<BracketData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [groups, { data: matchRows }] = await Promise.all([
    getGroupsForPrediction(),
    supabase
      .from("matches")
      .select("id, stage, home_team_id, away_team_id, lock_at, status, winner_team_id")
      .in("stage", KO_STAGES),
  ]);

  const teams: Record<string, BracketTeam> = {};
  for (const g of groups) for (const t of g.teams) teams[t.id] = { name: t.name, flag: t.flag };

  const matches: BracketMatchRow[] = (matchRows ?? []).map((m) => ({
    id: m.id, stage: m.stage, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id,
    lockAt: m.lock_at, status: m.status, winnerTeamId: m.winner_team_id,
  }));

  // Once every real group match is final, use the ACTUAL qualifiers; until then, the
  // user's PREDICTED qualifiers (from their group picks) so they can fill it now.
  const allGroupsFinal =
    groups.length > 0 && groups.every((g) => g.matches.length > 0 && g.matches.every((m) => m.status === "final"));

  // The official Round of 32 — especially where the four best third-placed teams
  // land — can only be formed once EVERY group is decided. So we only seed the
  // predicted bracket when all groups are fully predicted (or already final);
  // otherwise we'd fill empty groups with FIFA-rank guesses the user never made.
  const groupReady = (g: (typeof groups)[number]) =>
    g.matches.length > 0 &&
    g.matches.every((m) => m.status === "final" || (m.predictedHome != null && m.predictedAway != null));
  const groupsTotal = groups.length;
  const groupsReady = groups.filter(groupReady).length;
  const allGroupsReady = groupsTotal > 0 && groupsReady === groupsTotal;

  const r32: BracketData["r32"] = {};
  let mode: "predicted" | "actual";
  let seeded = true;
  if (allGroupsFinal) {
    mode = "actual";
    for (const m of matches) {
      if (m.stage === "r32") r32[m.id] = { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId };
    }
  } else if (!allGroupsReady) {
    // Not every group is predicted yet: present an empty bracket and prompt them.
    mode = "predicted";
    seeded = false;
    for (const m of matches) {
      if (m.stage === "r32") r32[m.id] = { homeTeamId: null, awayTeamId: null };
    }
  } else {
    mode = "predicted";
    const predicted = buildPredictedR32(
      groups.map((g) => ({
        label: g.label,
        teams: g.teams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
        matches: g.matches.map((m) => ({
          homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, status: m.status,
          homeScore: m.homeScore, awayScore: m.awayScore, predictedHome: m.predictedHome, predictedAway: m.predictedAway,
        })),
      }))
    );
    for (const [id, tie] of predicted) r32[id] = { homeTeamId: tie.homeTeamId, awayTeamId: tie.awayTeamId };
  }

  // "resolved" = the 16 R32 ties exist as a structure (groups + KO matches are loaded).
  // Whether every slot has a team is governed separately by `seeded`.
  const resolved = Object.keys(r32).length === 16;

  let picks: Record<string, string> = {};
  if (user) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id, predicted_winner_team_id")
      .eq("user_id", user.id)
      .not("predicted_winner_team_id", "is", null);
    picks = Object.fromEntries((preds ?? []).map((p) => [p.match_id, p.predicted_winner_team_id as string]));
  }

  return {
    resolved, mode, seeded, groupsReady, groupsTotal,
    teams, r32, matches, picks, userId: user?.id ?? null,
  };
}
