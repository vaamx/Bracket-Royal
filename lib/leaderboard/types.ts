// Client-safe leaderboard types + pure helpers (no server-only imports), so both
// the server query and the client component can share them.

export interface StandingRow {
  userId: string;
  displayName: string | null; // null → render as the localized "Guest"
  points: number;
  rank: number | null;
  exactCount: number;
}

export interface LeagueHeader {
  id: string;
  name: string;
  inviteCode: string;
  isGlobal: boolean;
}

/** Order every member: points desc, then exacts, then a deterministic id tiebreak. */
export function sortStandingRows(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort(
    (a, b) => b.points - a.points || b.exactCount - a.exactCount || a.userId.localeCompare(b.userId)
  );
}
