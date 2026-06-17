"use client";

import { useMemo } from "react";
import { predictedStandings } from "@/lib/predictions/toStandings";
import { PredictedTable } from "@/components/predict/PredictedTable";
import { MatchRow } from "@/components/predict/MatchRow";
import type { PredictGroup, PredictMatch } from "@/lib/predictions/types";
import { useI18n } from "@/lib/i18n/provider";

export function isLocked(m: PredictMatch): boolean {
  // Open until full-time: a prediction stays editable any time before the match
  // is final — including while it's live — so no in-progress game can block you.
  // Once the match finishes the real result is known, so it locks.
  return m.status === "final";
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
  const { t } = useI18n();
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

  // Group the 6 fixtures by matchday for readable section headers.
  const matchdays = useMemo(() => {
    const byDay = new Map<number | null, typeof group.matches>();
    for (const m of group.matches) {
      const d = m.matchday ?? null;
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d)!.push(m);
    }
    return [...byDay.entries()]
      .sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99))
      .map(([day, matches]) => ({ day, matches }));
  }, [group.matches]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
          <p className="text-[10px] font-bold uppercase tracking-[1.5px] text-white/40">{t.predict.predictedFinish}</p>
          <div className="flex items-center gap-3">
            <p className="flex items-center gap-1 text-[10px] font-bold text-[var(--bn-success)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--bn-success)]" /> {t.predict.top2}
            </p>
            <p className="flex items-center gap-1 text-[10px] font-bold text-[var(--bn-gold)]">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--bn-gold)]/70" /> {t.predict.third8}
            </p>
          </div>
        </div>
        <PredictedTable rows={standings} teamsById={teamsById} />
      </div>
      <div className="space-y-4">
        {matchdays.map(({ day, matches }) => (
          <div key={day ?? "x"} className="space-y-2">
            <p className="px-1 text-[10px] font-bold uppercase tracking-[1.5px] text-white/35">
              {day != null ? t.predict.matchday(day) : t.predict.fixtures}
            </p>
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
        ))}
      </div>
      <p className={"h-4 text-right text-xs " + (saveFailed ? "text-red-400" : "text-white/40")}>
        {saveFailed ? t.common.saveFailed : saving ? t.common.saving : t.common.savedAll}
      </p>
    </div>
  );
}
