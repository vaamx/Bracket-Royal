import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreUserGroupStage, predictedBestThirds } from "@/lib/scoring/groupScore";
import { parseScoringConfig } from "@/lib/scoring/types";
import type { ScoringMatch, ScoringPrediction, ScoringTeam } from "@/lib/scoring/types";
import { outcomeOf, rankThirdPlaceTeams, computeGroupStandings } from "@/lib/math";
import { computeQualifiers, resolveR32 } from "@/lib/bracket/resolve";
import { advanceActualBracket, type KOResult } from "@/lib/bracket/advance";
import { scoreUserKnockout, type StageSets } from "@/lib/scoring/knockoutScore";
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";
import { computeAchievements } from "@/lib/achievements/compute";

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
 * Resolve R32 once all group matches are final, and advance actual winners into
 * later slots as knockout matches finalize. Idempotent (only writes empty slots).
 */
export async function resolveAndAdvance(admin: SupabaseClient): Promise<{ r32Resolved: boolean; advanced: number }> {
  const [{ data: matches, error: mErr }, { data: teams, error: tErr }] = await Promise.all([
    admin.from("matches").select("id, stage, group_label, home_team_id, away_team_id, home_score, away_score, status, winner_team_id"),
    admin.from("teams").select("id, group_label, fifa_rank"),
  ]);
  if (mErr) throw mErr;
  if (tErr) throw tErr;

  const group = (matches ?? []).filter((m) => m.stage === "group");
  const groupsFinal = group.length > 0 && group.every((m) => m.status === "final");

  // 1. Resolve R32 from group results (only if all groups done and R32 still empty).
  let r32Resolved = false;
  const r32Rows = (matches ?? []).filter((m) => m.stage === "r32");
  const r32Empty = r32Rows.some((m) => !m.home_team_id || !m.away_team_id);
  if (groupsFinal && r32Empty) {
    const q = computeQualifiers(
      group.map((m) => ({
        group: m.group_label as string,
        homeTeamId: m.home_team_id as string,
        awayTeamId: m.away_team_id as string,
        homeScore: m.home_score as number,
        awayScore: m.away_score as number,
      })),
      (teams ?? []).map((t) => ({ id: t.id, group: t.group_label as string, fifaRank: t.fifa_rank ?? 999 }))
    );
    const ties = resolveR32(q);
    for (const [matchId, tie] of ties) {
      const { error } = await admin
        .from("matches")
        .update({ home_team_id: tie.homeTeamId, away_team_id: tie.awayTeamId })
        .eq("id", matchId);
      if (error) throw error;
    }
    r32Resolved = true;
  }

  // 2. Advance actual winners/losers from finalized KO matches into later slots.
  const koFinal: KOResult[] = (matches ?? [])
    .filter((m) => m.stage !== "group" && m.status === "final" && m.winner_team_id)
    .map((m) => ({
      matchId: m.id,
      winnerTeamId: m.winner_team_id as string,
      loserTeamId: m.winner_team_id === m.home_team_id ? (m.away_team_id as string) : (m.home_team_id as string),
    }));
  const slots = advanceActualBracket(koFinal);
  let advanced = 0;
  for (const [matchId, fill] of slots) {
    const patch: Record<string, string> = {};
    if (fill.homeTeamId) patch.home_team_id = fill.homeTeamId;
    if (fill.awayTeamId) patch.away_team_id = fill.awayTeamId;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("matches").update(patch).eq("id", matchId);
    if (error) throw error;
    advanced++;
  }

  return { r32Resolved, advanced };
}

/**
 * Recompute league_standings for every member of every league from scratch
 * (idempotent). Updates points, exact_count, and rank. Service-role only.
 */
export async function runScoring(admin: SupabaseClient): Promise<{ leagues: number; rows: number }> {
  const [teamsRes, matchesRes, predsRes, leaguesRes, membersRes, koMatchesRes, koPredsRes] = await Promise.all([
    admin.from("teams").select("id, group_label, fifa_rank"),
    admin.from("matches").select("id, group_label, home_team_id, away_team_id, home_score, away_score, status, kickoff_at").eq("stage", "group"),
    admin.from("predictions").select("user_id, match_id, predicted_home, predicted_away"),
    admin.from("leagues").select("id, scoring_config"),
    admin.from("league_members").select("league_id, user_id"),
    admin.from("matches").select("id, stage, home_team_id, away_team_id, winner_team_id, status"),
    admin.from("predictions").select("user_id, match_id, predicted_winner_team_id"),
  ]);
  for (const r of [teamsRes, matchesRes, predsRes, leaguesRes, membersRes, koMatchesRes, koPredsRes]) {
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

  // Knockout actual advancers per stage (winners), and best-8 actual thirds.
  const koMatches = koMatchesRes.data ?? [];
  const actualWinnersByStage = stageSetsFromWinners(koMatches);
  const actualThirds = bestThirdIds(matches, teams); // matches here = group matches already loaded

  // Knockout predictions by user: predicted winner per KO match id.
  const koPredsByUser = new Map<string, Map<string, string>>();
  for (const p of koPredsRes.data ?? []) {
    if (!p.predicted_winner_team_id) continue;
    const m = koPredsByUser.get(p.user_id) ?? new Map<string, string>();
    m.set(p.match_id, p.predicted_winner_team_id);
    koPredsByUser.set(p.user_id, m);
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
      const group = scoreUserGroupStage(predsByUser.get(userId) ?? [], matches, teams, config);
      const ko = scoreUserKnockout({
        predictedWinnersByStage: stageSetsFromPicks(koPredsByUser.get(userId) ?? new Map()),
        actualWinnersByStage: actualWinnersByStage,
        predictedThirds: predictedThirdIds(predsByUser.get(userId) ?? [], matches, teams),
        actualThirds,
        config,
      });
      return { league_id: leagueId, user_id: userId, points: group.points + ko.points, exact_count: group.exactCount };
    });

    // Competition ranking: sort by points desc; equal points share a rank.
    scored.sort((a, b) => b.points - a.points);
    const ranked = scored.map((s, i) => ({
      ...s,
      rank: scoredRank(scored, i), // standard competition rank (ties share a rank)
      updated_at: now,
    }));

    const { error } = await admin.from("league_standings").upsert(ranked, { onConflict: "league_id,user_id" });
    if (error) throw error;
    rows += ranked.length;
  }

  // Achievements are global (derived from a user's predictions vs real results),
  // so compute once per user and upsert (existing badges are kept via do-nothing).
  const finalChampion = koMatches.find((m) => m.id === "F-1" && m.status === "final")?.winner_team_id ?? null;
  const allUserIds = new Set<string>([...predsByUser.keys(), ...koPredsByUser.keys()]);
  const badgeRows: { user_id: string; badge_key: string }[] = [];
  for (const userId of allUserIds) {
    const { badges } = computeAchievements({
      groupMatches: matches.map((m) => ({
        id: m.id, group_label: m.group_label, kickoff_at: (m as { kickoff_at?: string | null }).kickoff_at ?? null,
        home_score: m.home_score, away_score: m.away_score, status: m.status,
      })),
      predictions: predsByUser.get(userId) ?? [],
      finalWinnerTeamId: finalChampion,
      finalPickTeamId: koPredsByUser.get(userId)?.get("F-1") ?? null,
    });
    for (const key of badges) badgeRows.push({ user_id: userId, badge_key: key });
  }
  if (badgeRows.length > 0) {
    const { error } = await admin.from("achievements").upsert(badgeRows, { onConflict: "user_id,badge_key", ignoreDuplicates: true });
    if (error) throw error;
  }

  return { leagues: membersByLeague.size, rows };
}

/** Standard competition rank: first index of this point total + 1. */
function scoredRank(scored: { points: number }[], i: number): number {
  const pts = scored[i].points;
  return scored.findIndex((s) => s.points === pts) + 1;
}

/** Map a stage string to the StageSets key (third-place playoff doesn't score). */
function stageKey(stage: string): keyof StageSets | null {
  if (stage === "r32" || stage === "r16" || stage === "qf" || stage === "sf" || stage === "final") return stage;
  return null;
}

/** Actual winners grouped by stage from finalized KO match rows. */
function stageSetsFromWinners(koMatches: Array<{ id: string; stage: string; winner_team_id: string | null; status: string }>): StageSets {
  const out: StageSets = { r32: [], r16: [], qf: [], sf: [], final: [] };
  for (const m of koMatches) {
    const k = stageKey(m.stage);
    if (k && m.status === "final" && m.winner_team_id) out[k].push(m.winner_team_id);
  }
  return out;
}

/** A user's predicted winners grouped by stage, from their KO winner picks. */
function stageSetsFromPicks(picks: Map<string, string>): StageSets {
  const out: StageSets = { r32: [], r16: [], qf: [], sf: [], final: [] };
  for (const m of KNOCKOUT_MATCHES) {
    const k = stageKey(m.stage);
    const pick = picks.get(m.id);
    if (k && pick) out[k].push(pick);
  }
  return out;
}

/** Best-8 actual thirds from final group results. */
function bestThirdIds(groupMatches: ScoringMatch[], teams: ScoringTeam[]): string[] {
  const groups = [...new Set(teams.map((t) => t.group_label).filter(Boolean))] as string[];
  const thirdRows = [];
  for (const g of groups) {
    const gm = groupMatches.filter((m) => m.group_label === g && m.status === "final" && m.home_score !== null);
    if (gm.length === 0) continue;
    const gt = teams.filter((t) => t.group_label === g);
    if (gm.length !== gt.length * (gt.length - 1) / 2) continue; // group not complete
    const table = computeGroupStandings(
      gm.map((m) => ({ homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeScore: m.home_score as number, awayScore: m.away_score as number })),
      { fifaRank: Object.fromEntries(gt.map((t) => [t.id, t.fifaRank])) }
    );
    if (table[2]) thirdRows.push(table[2]);
  }
  return rankThirdPlaceTeams(thirdRows, 8).map((r) => r.teamId);
}

/** A user's predicted best-8 thirds from their group predictions. */
function predictedThirdIds(predictions: ScoringPrediction[], groupMatches: ScoringMatch[], teams: ScoringTeam[]): string[] {
  // Reuse predictedStandings per group to get each predicted 3rd, then rank.
  // (Imported helper — see import note in Step 3.)
  return predictedBestThirds(predictions, groupMatches, teams);
}
