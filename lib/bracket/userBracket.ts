import { KNOCKOUT_MATCHES } from "@/lib/bracket/structure";

export interface BracketSlotView {
  homeTeamId?: string;
  awayTeamId?: string;
  pick?: string;
}

export interface R32Teams {
  [matchId: string]: { homeTeamId: string | null; awayTeamId: string | null };
}

/**
 * Build the user's predicted bracket from the real R32 teams + their winner picks.
 * Teams for R16+ are derived by propagating each match's pick through the feeds
 * tree (and semifinal losers into the third-place match). A pick is valid only if
 * it is one of its tie's two current teams; invalid (e.g. orphaned by an upstream
 * change) picks are pruned and excluded from `validPicks`.
 */
export function buildBracketView(
  r32Teams: R32Teams,
  picks: Record<string, string>
): { view: Record<string, BracketSlotView>; validPicks: Record<string, string> } {
  // Accumulate slot teams as we process rounds in order.
  const slots: Record<string, { homeTeamId?: string; awayTeamId?: string }> = {};
  for (const [id, t] of Object.entries(r32Teams)) {
    slots[id] = { homeTeamId: t.homeTeamId ?? undefined, awayTeamId: t.awayTeamId ?? undefined };
  }

  const view: Record<string, BracketSlotView> = {};
  const validPicks: Record<string, string> = {};

  const place = (feedMatchId: string, side: "home" | "away", teamId: string) => {
    const cur = slots[feedMatchId] ?? {};
    if (side === "home") cur.homeTeamId = teamId;
    else cur.awayTeamId = teamId;
    slots[feedMatchId] = cur;
  };

  for (const m of KNOCKOUT_MATCHES) {
    const slot = slots[m.id] ?? {};
    const { homeTeamId, awayTeamId } = slot;
    const pick = picks[m.id];
    const valid = pick !== undefined && (pick === homeTeamId || pick === awayTeamId);

    view[m.id] = { homeTeamId, awayTeamId, pick: valid ? pick : undefined };
    if (valid) {
      validPicks[m.id] = pick;
      if (m.winnerTo) place(m.winnerTo.matchId, m.winnerTo.side, pick);
      if (m.loserTo) {
        const loser = pick === homeTeamId ? awayTeamId : homeTeamId;
        if (loser) place(m.loserTo.matchId, m.loserTo.side, loser);
      }
    }
  }

  return { view, validPicks };
}
