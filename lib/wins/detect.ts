/** A medal a user has earned from real results. */
export interface DailyWin {
  winKey: string;          // unique per user — idempotency key
  kind: "exact" | "goals";
  detail: string;          // locale-neutral summary for display/email
}

export interface DetectInput {
  /** Finalized matches with their real scorelines. */
  finalMatches: { id: string; homeCode: string; awayCode: string; homeScore: number; awayScore: number }[];
  /** Each user's scoreline predictions. */
  predictionsByUser: Map<string, { matchId: string; predHome: number | null; predAway: number | null }[]>;
  /** Each user's scorer picks with their predicted goal tally. */
  scorerByUser: Map<string, { playerId: string; predictedGoals: number | null }[]>;
  /** Real goal totals + display names per player. */
  playerGoals: Record<string, number>;
  playerName: Record<string, string>;
  /** True once every match is final — only then is a player's goal tally safe to medal. */
  tournamentComplete: boolean;
}

/**
 * Pure detector for daily-win medals.
 * - 🎯 exact: a finalized match whose real scoreline matches the user's prediction.
 * - ⚽ goals: a picked player whose FINAL goal tally matches the user's prediction
 *   (only awarded once the tournament is complete, so it can't be revoked by a
 *   later goal). Trivial 0-goal predictions don't count.
 */
export function detectDailyWins(input: DetectInput): Map<string, DailyWin[]> {
  const matchById = new Map(input.finalMatches.map((m) => [m.id, m]));
  const out = new Map<string, DailyWin[]>();

  for (const [userId, preds] of input.predictionsByUser) {
    const wins: DailyWin[] = [];
    for (const p of preds) {
      const m = matchById.get(p.matchId);
      if (!m || p.predHome === null || p.predAway === null) continue;
      if (p.predHome === m.homeScore && p.predAway === m.awayScore) {
        wins.push({ winKey: `exact:${m.id}`, kind: "exact", detail: `${m.homeCode} ${m.homeScore}–${m.awayScore} ${m.awayCode}` });
      }
    }
    if (wins.length) out.set(userId, wins);
  }

  if (input.tournamentComplete) {
    for (const [userId, picks] of input.scorerByUser) {
      const wins = out.get(userId) ?? [];
      for (const pick of picks) {
        if (pick.predictedGoals == null || pick.predictedGoals <= 0) continue;
        const actual = input.playerGoals[pick.playerId] ?? 0;
        if (actual === pick.predictedGoals) {
          wins.push({
            winKey: `goals:${pick.playerId}`, kind: "goals",
            detail: `${input.playerName[pick.playerId] ?? pick.playerId} · ${actual}`,
          });
        }
      }
      if (wins.length) out.set(userId, wins);
    }
  }

  return out;
}
