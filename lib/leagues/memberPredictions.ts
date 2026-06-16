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
  locked: MemberPredItem[];   // matches that are revealed (locked, or all if private)
  hiddenCount: number;        // upcoming matches hidden (0 for private leagues)
  scorerPicks: { playerId: string; name: string; flag: string | null; teamId: string | null; isBoot: boolean }[];
}

function isLocked(m: { status: string; lock_at: string | null }, now: number): boolean {
  return m.status === "final" || m.status === "live" || (m.lock_at !== null && new Date(m.lock_at).getTime() <= now);
}

/**
 * A league co-member's predictions.
 * - Global league: reveals ONLY locked matches (kicked off / final), no scorer picks — fair play.
 * - Private league (is_global=false): reveals ALL predicted matches regardless of lock,
 *   AND shows the teammate's Top-Scorer picks (Golden Boot first).
 * Reads via the service-role client (predictions are owner-only under RLS) after
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

  // Determine if this is a private league
  const { data: league } = await admin.from("leagues").select("is_global").eq("id", leagueId).maybeSingle();
  const isPrivate = league ? !league.is_global : false;

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

    // In private leagues reveal everything; in global leagues only reveal locked matches
    const revealed = isPrivate || isLocked(m, now);
    if (!revealed) { hiddenCount++; continue; }

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

  // Fetch scorer picks only for private leagues
  let scorerPicks: MemberPredView["scorerPicks"] = [];
  if (isPrivate) {
    const { data: scorerPreds } = await admin
      .from("scorer_predictions")
      .select("player_id, is_golden_boot")
      .eq("user_id", targetUserId);

    if (scorerPreds && scorerPreds.length > 0) {
      const playerIds = scorerPreds.map((sp) => sp.player_id);
      const { data: players } = await admin
        .from("players")
        .select("id, name, team_id")
        .in("id", playerIds);

      // Reuse teamById already loaded above for flag lookups
      const playerMap = new Map((players ?? []).map((pl) => [pl.id, pl]));

      scorerPicks = scorerPreds
        .map((sp) => {
          const pl = playerMap.get(sp.player_id);
          if (!pl) return null;
          const teamEntry = pl.team_id ? teamById.get(pl.team_id) : null;
          return {
            playerId: sp.player_id,
            name: pl.name,
            flag: teamEntry?.flag ?? null,
            teamId: pl.team_id ?? null,
            isBoot: sp.is_golden_boot,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        // Golden Boot first, then alphabetical
        .sort((a, b) => (b.isBoot ? 1 : 0) - (a.isBoot ? 1 : 0) || a.name.localeCompare(b.name));
    }
  }

  return { displayName: profile?.display_name ?? null, locked, hiddenCount, scorerPicks };
}
