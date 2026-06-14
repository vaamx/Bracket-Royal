import type { NormalizedResult, ResultsProvider } from "@/lib/feed/provider";

interface FDMatch {
  status: string;
  homeTeam: { tla: string | null };
  awayTeam: { tla: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
}
interface FDResponse { matches: FDMatch[] }

/** Maps a finished provider match (by team TLAs) to our internal match id, or null. */
export type MatchIdResolver = (homeTla: string, awayTla: string) => string | null;

/** Pure parser: normalize a football-data /matches payload to our result shape. */
export function parseFootballDataMatches(payload: FDResponse, resolve: MatchIdResolver): NormalizedResult[] {
  const out: NormalizedResult[] = [];
  for (const m of payload.matches ?? []) {
    if (m.status !== "FINISHED") continue;
    const ft = m.score?.fullTime;
    if (!m.homeTeam?.tla || !m.awayTeam?.tla || ft?.home == null || ft?.away == null) continue;
    const matchId = resolve(m.homeTeam.tla, m.awayTeam.tla);
    if (!matchId) continue;
    out.push({ matchId, homeScore: ft.home, awayScore: ft.away });
  }
  return out;
}

/**
 * Real football-data.org adapter. Requires FOOTBALL_DATA_API_KEY and a resolver
 * mapping provider team TLAs to our internal match ids (wired when real fixtures
 * replace the dev seed). Without a key it yields no results.
 */
export function footballDataProvider(resolve: MatchIdResolver): ResultsProvider {
  return {
    name: "football-data.org",
    async fetchFinishedResults(): Promise<NormalizedResult[]> {
      const key = process.env.FOOTBALL_DATA_API_KEY;
      if (!key) return [];
      const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED", {
        headers: { "X-Auth-Token": key },
      });
      if (!res.ok) throw new Error(`football-data ${res.status}`);
      const payload = (await res.json()) as FDResponse;
      return parseFootballDataMatches(payload, resolve);
    },
  };
}
