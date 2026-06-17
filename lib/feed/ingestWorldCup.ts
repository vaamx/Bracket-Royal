import type { SupabaseClient } from "@supabase/supabase-js";
import { outcomeOf } from "@/lib/math";
import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";

/** Flag emoji by football-data team TLA (the 48 WC2026 nations). */
export const FLAG_BY_TLA: Record<string, string> = {
  ALG: "🇩🇿", ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BIH: "🇧🇦", BRA: "🇧🇷",
  CAN: "🇨🇦", CIV: "🇨🇮", COD: "🇨🇩", COL: "🇨🇴", CPV: "🇨🇻", CRO: "🇭🇷", CUW: "🇨🇼",
  CZE: "🇨🇿", ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸", FRA: "🇫🇷", GER: "🇩🇪",
  GHA: "🇬🇭", HAI: "🇭🇹", IRN: "🇮🇷", IRQ: "🇮🇶", JOR: "🇯🇴", JPN: "🇯🇵", KOR: "🇰🇷",
  KSA: "🇸🇦", MAR: "🇲🇦", MEX: "🇲🇽", NED: "🇳🇱", NOR: "🇳🇴", NZL: "🇳🇿", PAN: "🇵🇦",
  PAR: "🇵🇾", POR: "🇵🇹", QAT: "🇶🇦", RSA: "🇿🇦", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", SEN: "🇸🇳", SUI: "🇨🇭",
  SWE: "🇸🇪", TUN: "🇹🇳", TUR: "🇹🇷", URY: "🇺🇾", USA: "🇺🇸", UZB: "🇺🇿",
};

export type MatchStatus = "scheduled" | "live" | "final";

export function mapStatus(fdStatus: string): MatchStatus {
  if (fdStatus === "FINISHED") return "final";
  if (fdStatus === "IN_PLAY" || fdStatus === "PAUSED") return "live";
  return "scheduled";
}

/** "GROUP_A" -> "A"; non-group -> null. */
export function groupLetter(fdGroup: string | null | undefined): string | null {
  return fdGroup && fdGroup.startsWith("GROUP_") ? fdGroup.slice("GROUP_".length) : null;
}

export interface FdTeam {
  tla: string;
  name: string;
}
export interface FdMatch {
  id: number;
  stage: string;
  group: string | null;
  status: string;
  utcDate: string;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

export interface GroupMatchRow {
  id: string;
  stage: "group";
  group_label: string;
  home_team_id: string;
  away_team_id: string;
  kickoff_at: string;
  lock_at: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
}

/**
 * Predictions stay open until roughly halftime so people who join late can
 * still play. This is the lock offset from kickoff — a first half plus typical
 * stoppage. (DB RLS enforces `now() < lock_at`, so this value is the real gate.)
 */
export const HALFTIME_LOCK_MINUTES = 50;
export function lockAtFor(kickoffISO: string): string {
  return new Date(new Date(kickoffISO).getTime() + HALFTIME_LOCK_MINUTES * 60_000).toISOString();
}

/** Map a football-data GROUP_STAGE match to our matches row (id = G{group}-{home}-{away}). */
export function toGroupMatchRow(m: FdMatch): GroupMatchRow {
  const g = groupLetter(m.group);
  if (!g) throw new Error(`match ${m.id} is not a group match`);
  const status = mapStatus(m.status);
  const final = status === "final";
  const hs = m.score?.fullTime?.home ?? null;
  const as = m.score?.fullTime?.away ?? null;
  let winner: string | null = null;
  if (final && hs !== null && as !== null) {
    const o = outcomeOf(hs, as);
    winner = o === "home" ? m.homeTeam.tla : o === "away" ? m.awayTeam.tla : null;
  }
  return {
    id: `G${g}-${m.homeTeam.tla}-${m.awayTeam.tla}`,
    stage: "group",
    group_label: g,
    home_team_id: m.homeTeam.tla,
    away_team_id: m.awayTeam.tla,
    kickoff_at: m.utcDate,
    lock_at: lockAtFor(m.utcDate),
    status,
    home_score: final ? hs : null,
    away_score: final ? as : null,
    winner_team_id: winner,
  };
}

/** Derive the 48 team rows (id=TLA, real group) from the group-stage matches. */
export function deriveTeamRows(groupMatches: FdMatch[]): Array<{ id: string; name: string; flag: string; group_label: string; fifa_rank: null }> {
  const byId = new Map<string, { id: string; name: string; flag: string; group_label: string; fifa_rank: null }>();
  for (const m of groupMatches) {
    const g = groupLetter(m.group)!;
    for (const t of [m.homeTeam, m.awayTeam]) {
      if (!byId.has(t.tla)) {
        byId.set(t.tla, { id: t.tla, name: t.name, flag: FLAG_BY_TLA[t.tla] ?? "🏳️", group_label: g, fifa_rank: null });
      }
    }
  }
  return [...byId.values()];
}

/** Fetch the WC group stage from football-data.org and map it to our rows. */
export async function fetchWorldCupGroups(
  fetchImpl: typeof fetch = fetch
): Promise<{ teamRows: ReturnType<typeof deriveTeamRows>; matchRows: GroupMatchRow[] }> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
  const res = await fetchImpl("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": key },
  });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  const data = (await res.json()) as { matches: FdMatch[] };
  const groupMatches = (data.matches ?? []).filter((m) => m.stage === "GROUP_STAGE" && m.group);
  return { teamRows: deriveTeamRows(groupMatches), matchRows: groupMatches.map(toGroupMatchRow) };
}

/**
 * One-time switchover: replace synthetic data with the real WC2026 group stage and
 * (re)seed our knockout shell. DESTRUCTIVE — clears predictions/standings/
 * achievements/matches/teams first. Use `refreshWorldCupResults` for ongoing updates.
 */
export async function ingestWorldCup(
  admin: SupabaseClient,
  fetchImpl: typeof fetch = fetch
): Promise<{ teams: number; groupMatches: number; finished: number }> {
  const { teamRows, matchRows } = await fetchWorldCupGroups(fetchImpl);
  const koRows = KNOCKOUT_MATCHES.map((m) => ({
    id: m.id, stage: m.stage, group_label: null, bracket_slot: m.id,
    home_team_id: null, away_team_id: null,
    kickoff_at: "2026-06-28T18:00:00Z", lock_at: lockAtFor("2026-06-28T18:00:00Z"), status: "scheduled" as const,
  }));

  // Clean slate (local exploration DB) — order respects FKs.
  await admin.from("predictions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("league_standings").delete().neq("league_id", "00000000-0000-0000-0000-000000000000");
  await admin.from("achievements").delete().neq("badge_key", "");
  await admin.from("matches").delete().neq("id", "");
  await admin.from("teams").delete().neq("id", "");

  const ins = async (table: string, rows: object[]) => {
    const { error } = await admin.from(table).insert(rows);
    if (error) throw error;
  };
  await ins("teams", teamRows);
  await ins("matches", matchRows);
  await ins("matches", koRows);

  return { teams: teamRows.length, groupMatches: matchRows.length, finished: matchRows.filter((r) => r.status === "final").length };
}

export interface FdKoResult {
  homeTla: string;
  awayTla: string;
  homeScore: number;
  awayScore: number;
}
export interface OurKoMatch {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string;
}
export interface MatchResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

const pairKey = (a: string, b: string) => [a, b].sort().join("|");

/**
 * Map finished football-data knockout matches to OUR resolved knockout matches by
 * team pairing (the feed has no slot labels). Only matches our not-yet-final ties
 * whose two teams equal the feed match's two teams; orients the score to our home/away.
 */
export function knockoutResultsByTeamPair(ourKo: OurKoMatch[], fd: FdKoResult[]): MatchResult[] {
  const byPair = new Map<string, OurKoMatch>();
  for (const m of ourKo) {
    if (!m.home_team_id || !m.away_team_id || m.status === "final") continue;
    byPair.set(pairKey(m.home_team_id, m.away_team_id), m);
  }
  const out: MatchResult[] = [];
  for (const r of fd) {
    const m = byPair.get(pairKey(r.homeTla, r.awayTla));
    if (!m) continue;
    const sameOrientation = m.home_team_id === r.homeTla;
    out.push({
      matchId: m.id,
      homeScore: sameOrientation ? r.homeScore : r.awayScore,
      awayScore: sameOrientation ? r.awayScore : r.homeScore,
    });
  }
  return out;
}

/** Fetch the finished knockout results from football-data (real teams + scores). */
export async function fetchKnockoutFinals(fetchImpl: typeof fetch = fetch): Promise<FdKoResult[]> {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
  const res = await fetchImpl("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": key },
  });
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  const data = (await res.json()) as { matches: FdMatch[] };
  return (data.matches ?? [])
    .filter(
      (m) =>
        m.stage !== "GROUP_STAGE" &&
        m.status === "FINISHED" &&
        m.homeTeam?.tla &&
        m.awayTeam?.tla &&
        m.score?.fullTime?.home !== null &&
        m.score?.fullTime?.away !== null
    )
    .map((m) => ({
      homeTla: m.homeTeam.tla,
      awayTla: m.awayTeam.tla,
      homeScore: m.score.fullTime.home as number,
      awayScore: m.score.fullTime.away as number,
    }));
}

/**
 * Non-destructive refresh: upsert teams + group match results (status/scores/winner).
 * Safe to run on a schedule — never deletes predictions. For the cron.
 */
export async function refreshWorldCupResults(
  admin: SupabaseClient,
  fetchImpl: typeof fetch = fetch
): Promise<{ updated: number; finished: number }> {
  const { teamRows, matchRows } = await fetchWorldCupGroups(fetchImpl);
  const t = await admin.from("teams").upsert(teamRows, { onConflict: "id" });
  if (t.error) throw t.error;
  const m = await admin.from("matches").upsert(matchRows, { onConflict: "id" });
  if (m.error) throw m.error;
  return { updated: matchRows.length, finished: matchRows.filter((r) => r.status === "final").length };
}
