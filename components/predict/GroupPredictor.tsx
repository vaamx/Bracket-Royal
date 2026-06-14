"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { predictedStandings } from "@/lib/predictions/toStandings";
import { PredictedTable } from "@/components/predict/PredictedTable";
import { MatchRow } from "@/components/predict/MatchRow";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";

function isLocked(m: PredictMatch): boolean {
  if (m.status === "final" || m.status === "live") return true;
  return m.lockAt !== null && new Date(m.lockAt).getTime() <= Date.now();
}

export function GroupPredictor({ group, userId }: { group: PredictGroup; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [matches, setMatches] = useState<PredictMatch[]>(group.matches);
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const teamsById = useMemo(
    () => Object.fromEntries(group.teams.map((t) => [t.id, t])),
    [group.teams]
  );

  const standings = useMemo(
    () =>
      predictedStandings(
        group.teams.map((t) => ({ id: t.id, fifaRank: t.fifaRank })),
        matches.map((m) => ({
          home_team_id: m.homeTeamId,
          away_team_id: m.awayTeamId,
          predicted_home: m.predictedHome,
          predicted_away: m.predictedAway,
        }))
      ),
    [matches, group.teams]
  );

  function scheduleSave(match: PredictMatch) {
    clearTimeout(timers.current[match.id]);
    timers.current[match.id] = setTimeout(async () => {
      if (match.predictedHome === null || match.predictedAway === null) return;
      setSaving(true);
      await supabase.from("predictions").upsert(
        {
          user_id: userId,
          match_id: match.id,
          predicted_home: match.predictedHome,
          predicted_away: match.predictedAway,
        },
        { onConflict: "user_id,match_id" }
      );
      setSaving(false);
    }, 600);
  }

  function onScore(matchId: string, side: "home" | "away", value: number | null) {
    setMatches((prev) => {
      const next = prev.map((m) =>
        m.id === matchId
          ? { ...m, predictedHome: side === "home" ? value : m.predictedHome, predictedAway: side === "away" ? value : m.predictedAway }
          : m
      );
      const updated = next.find((m) => m.id === matchId)!;
      scheduleSave(updated);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <PredictedTable rows={standings} teamsById={teamsById} />
      <div className="space-y-2">
        {matches.map((m) => (
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
      <p className="h-4 text-right text-xs text-white/40">{saving ? "Saving…" : "All changes saved"}</p>
    </div>
  );
}
