"use client";

import { useMemo } from "react";
import { predictedStandings } from "@/lib/predictions/toStandings";
import { PredictedTable } from "@/components/predict/PredictedTable";
import { MatchRow } from "@/components/predict/MatchRow";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";

export function isLocked(m: PredictMatch): boolean {
  if (m.status === "final" || m.status === "live") return true;
  return m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now();
}

/**
 * Controlled view of one group: the live predicted table + its match rows.
 * Match state and saving live in the parent (PredictClient) so the stepper's
 * progress reflects edits live; this component just renders and reports scores up.
 */
export function GroupPredictor({
  group,
  saving,
  saveFailed,
  onScore,
}: {
  group: PredictGroup;
  saving: boolean;
  saveFailed: boolean;
  onScore: (matchId: string, side: "home" | "away", value: number | null) => void;
}) {
  const teamsById = useMemo(
    () => Object.fromEntries(group.teams.map((t) => [t.id, t])),
    [group.teams]
  );

  const standings = useMemo(
    () =>
      predictedStandings(
        group.teams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
        group.matches.map((m) => {
          // Already-played matches count their REAL result; the rest use your pick.
          const final = m.status === "final" && m.homeScore !== null && m.awayScore !== null;
          return {
            home_team_id: m.homeTeamId,
            away_team_id: m.awayTeamId,
            predicted_home: final ? m.homeScore : m.predictedHome,
            predicted_away: final ? m.awayScore : m.predictedAway,
          };
        })
      ),
    [group.matches, group.teams]
  );

  return (
    <div className="space-y-4">
      <PredictedTable rows={standings} teamsById={teamsById} />
      <div className="space-y-2">
        {group.matches.map((m) => (
          <MatchRow
            key={m.id}
            match={m}
            home={teamsById[m.homeTeamId]}
            away={teamsById[m.awayTeamId]}
            locked={isLocked(m)}
            onScore={(side, v) => onScore(m.id, side, v)}
          />
        ))}
      </div>
      <p className={"h-4 text-right text-xs " + (saveFailed ? "text-red-400" : "text-white/40")}>
        {saveFailed ? "Couldn't save — check your connection" : saving ? "Saving…" : "All changes saved"}
      </p>
    </div>
  );
}
