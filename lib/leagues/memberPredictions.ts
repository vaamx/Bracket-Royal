import { createAdminClient } from "@/lib/supabase/admin";
import { outcomeOf } from "@/lib/math";

export interface MemberPredItem {
  matchId: string;
  stage: string;
  groupLabel: string | null;
  kickoffAt: string | null;
  home: { id: string; name: string; flag: string | null } | null;
  away: { id: string; name: string; flag: string | null } | null;
  predHome: number | null;
  predAway: number | null;
  predWinnerId: string | null;
  final: boolean;
  homeScore: number | null;
  awayScore: number | null;
  verdict: "exact" | "result" | "miss" | null; // group-style verdict when final + predicted
}

export interface MemberPredView {
  displayName: string | null;
  locked: MemberPredItem[];   // matches that have kicked off (revealable)
  hiddenCount: number;        // upcoming matches they've predicted (kept secret until kickoff)
}

function isLocked(m: { status: string; lock_at: string | null }, now: number): boolean {
  return m.status === "final" || m.status === "live" || (m.lock_at !== null && new Date(m.lock_at).getTime() <= now);
}

/**
 * A league co-member's predictions, revealed ONLY for matches that have locked
 * (kicked off / final) — so nobody can copy picks before a match starts. Reads
 * via the service-role client (predictions are owner-only under RLS) after
 * verifying both the viewer and target belong to the league. null = not allowed.
 */
export async function getMemberPredictions(
  leagueId: string, targetUserId: string, viewerId: string
): Promise<MemberPredView | null> {
  let admin;
  try { admin = createAdminClient(); } catch { return null; }

  const { data: members } = await admin
    .from("league_members").select("user_id").eq("league_id", leagueId).in("user_id", [viewerId, targetUserId]);
  const ids = new Set((members ?? []).map((m) => m.user_id));
  if (!ids.has(viewerId) || !ids.has(targetUserId)) return null; // both must be members

  const [{ data: profile }, { data: matches }, { data: teams }, { data: preds }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", targetUserId).maybeSingle(),
    admin.from("matches").select("id, stage, group_label, home_team_id, away_team_id, kickoff_at, lock_at, status, home_score, away_score, winner_team_id"),
    admin.from("teams").select("id, name, flag"),
    admin.from("predictions").select("match_id, predicted_home, predicted_away, predicted_winner_team_id").eq("user_id", targetUserId),
  ]);

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const predByMatch = new Map((preds ?? []).map((p) => [p.match_id, p]));
  const now = Date.now();

  const locked: MemberPredItem[] = [];
  let hiddenCount = 0;

  for (const m of matches ?? []) {
    const p = predByMatch.get(m.id);
    const hasPred = p && (p.predicted_home !== null || p.predicted_away !== null || p.predicted_winner_team_id !== null);
    if (!hasPred) continue;
    if (!isLocked(m, now)) { hiddenCount++; continue; }

    const final = m.status === "final" && m.home_score !== null && m.away_score !== null;
    let verdict: MemberPredItem["verdict"] = null;
    if (final && p!.predicted_home !== null && p!.predicted_away !== null) {
      const exact = p!.predicted_home === m.home_score && p!.predicted_away === m.away_score;
      const sameOutcome = outcomeOf(p!.predicted_home, p!.predicted_away) === outcomeOf(m.home_score as number, m.away_score as number);
      verdict = exact ? "exact" : sameOutcome ? "result" : "miss";
    }
    const team = (id: string | null) => {
      if (!id) return null;
      const tt = teamById.get(id);
      return tt ? { id, name: tt.name, flag: tt.flag } : { id, name: id, flag: null };
    };
    locked.push({
      matchId: m.id, stage: m.stage, groupLabel: m.group_label, kickoffAt: m.kickoff_at,
      home: team(m.home_team_id), away: team(m.away_team_id),
      predHome: p!.predicted_home, predAway: p!.predicted_away, predWinnerId: p!.predicted_winner_team_id,
      final, homeScore: m.home_score, awayScore: m.away_score, verdict,
    });
  }

  locked.sort((a, b) => (a.kickoffAt ?? "").localeCompare(b.kickoffAt ?? ""));
  return { displayName: profile?.display_name ?? null, locked, hiddenCount };
}
