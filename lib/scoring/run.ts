import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreUserGroupStage } from "@/lib/scoring/groupScore";
import { parseScoringConfig } from "@/lib/scoring/types";
import type { ScoringMatch, ScoringPrediction, ScoringTeam } from "@/lib/scoring/types";
import { outcomeOf } from "@/lib/math";

export interface NormalizedResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

// NOTE: these take an injected service-role client rather than importing the
// `server-only` admin module, so they can also run from Node scripts/tests
// (the simulate script and the integration test). Callers in server runtime
// pass `createAdminClient()`; scripts/tests pass their own service-role client.

/** Write final results to matches (status=final, winner). Caller passes a service-role client. */
export async function applyResults(admin: SupabaseClient, results: NormalizedResult[]): Promise<number> {
  if (results.length === 0) return 0;
  // Need the team ids to resolve a winner; fetch the affected matches.
  const ids = results.map((r) => r.matchId);
  const { data: rows, error } = await admin
    .from("matches")
    .select("id, home_team_id, away_team_id")
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((rows ?? []).map((m) => [m.id, m]));

  let applied = 0;
  for (const r of results) {
    const m = byId.get(r.matchId);
    if (!m) continue; // unknown match id — skip
    const o = outcomeOf(r.homeScore, r.awayScore);
    const winner = o === "home" ? m.home_team_id : o === "away" ? m.away_team_id : null;
    const { error: upErr } = await admin
      .from("matches")
      .update({ home_score: r.homeScore, away_score: r.awayScore, status: "final", winner_team_id: winner })
      .eq("id", r.matchId);
    if (upErr) throw upErr;
    applied++;
  }
  return applied;
}

/**
 * Recompute league_standings for every member of every league from scratch
 * (idempotent). Updates points, exact_count, and rank. Service-role only.
 */
export async function runScoring(admin: SupabaseClient): Promise<{ leagues: number; rows: number }> {
  const [teamsRes, matchesRes, predsRes, leaguesRes, membersRes] = await Promise.all([
    admin.from("teams").select("id, group_label, fifa_rank"),
    admin.from("matches").select("id, group_label, home_team_id, away_team_id, home_score, away_score, status").eq("stage", "group"),
    admin.from("predictions").select("user_id, match_id, predicted_home, predicted_away"),
    admin.from("leagues").select("id, scoring_config"),
    admin.from("league_members").select("league_id, user_id"),
  ]);
  for (const r of [teamsRes, matchesRes, predsRes, leaguesRes, membersRes]) {
    if (r.error) throw r.error;
  }

  const teams: ScoringTeam[] = (teamsRes.data ?? []).map((t) => ({
    id: t.id, group_label: t.group_label, fifaRank: t.fifa_rank ?? 999,
  }));
  const matches = (matchesRes.data ?? []) as ScoringMatch[];

  const predsByUser = new Map<string, ScoringPrediction[]>();
  for (const p of predsRes.data ?? []) {
    const list = predsByUser.get(p.user_id) ?? [];
    list.push({ match_id: p.match_id, predicted_home: p.predicted_home, predicted_away: p.predicted_away });
    predsByUser.set(p.user_id, list);
  }

  const configByLeague = new Map((leaguesRes.data ?? []).map((l) => [l.id, parseScoringConfig(l.scoring_config)]));
  const membersByLeague = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const list = membersByLeague.get(m.league_id) ?? [];
    list.push(m.user_id);
    membersByLeague.set(m.league_id, list);
  }

  const now = new Date().toISOString();
  let rows = 0;
  for (const [leagueId, userIds] of membersByLeague) {
    const config = configByLeague.get(leagueId);
    if (!config) continue;

    const scored = userIds.map((userId) => {
      const { points, exactCount } = scoreUserGroupStage(
        predsByUser.get(userId) ?? [], matches, teams, config
      );
      return { league_id: leagueId, user_id: userId, points, exact_count: exactCount };
    });

    // Competition ranking: sort by points desc; equal points share a rank.
    scored.sort((a, b) => b.points - a.points);
    const ranked = scored.map((s, i) => ({
      ...s,
      rank: i > 0 && scored[i - 1].points === s.points ? (scoredRank(scored, i)) : i + 1,
      updated_at: now,
    }));

    const { error } = await admin.from("league_standings").upsert(ranked, { onConflict: "league_id,user_id" });
    if (error) throw error;
    rows += ranked.length;
  }

  return { leagues: membersByLeague.size, rows };
}

/** Standard competition rank: first index of this point total + 1. */
function scoredRank(scored: { points: number }[], i: number): number {
  const pts = scored[i].points;
  return scored.findIndex((s) => s.points === pts) + 1;
}
