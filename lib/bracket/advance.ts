import { KNOCKOUT_BY_ID } from "@/lib/bracket/structure";

export interface KOResult {
  matchId: string;
  winnerTeamId: string;
  loserTeamId: string;
}

export interface SlotFill {
  homeTeamId?: string;
  awayTeamId?: string;
}

/**
 * Given finalized knockout results, compute which teams occupy each downstream
 * slot (R16 from R32 winners, … final from SF winners, third-place from SF losers).
 * Returns only slots that have at least one team filled.
 */
export function advanceActualBracket(results: KOResult[]): Map<string, SlotFill> {
  const slots = new Map<string, SlotFill>();
  const put = (matchId: string, side: "home" | "away", teamId: string) => {
    const cur = slots.get(matchId) ?? {};
    if (side === "home") cur.homeTeamId = teamId;
    else cur.awayTeamId = teamId;
    slots.set(matchId, cur);
  };

  for (const r of results) {
    const m = KNOCKOUT_BY_ID.get(r.matchId);
    if (!m) continue;
    if (m.winnerTo) put(m.winnerTo.matchId, m.winnerTo.side, r.winnerTeamId);
    if (m.loserTo) put(m.loserTo.matchId, m.loserTo.side, r.loserTeamId);
  }
  return slots;
}
