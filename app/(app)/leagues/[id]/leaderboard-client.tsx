"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { StandingRow } from "@/lib/leaderboard/queries";
import { useI18n } from "@/lib/i18n/provider";

const MEDALS = ["🥇", "🥈", "🥉"];

export function LeaderboardClient({
  leagueId, initialRows, meId,
}: {
  leagueId: string;
  initialRows: StandingRow[];
  meId?: string | null;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<StandingRow[]>(initialRows);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`standings:${leagueId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_standings", filter: `league_id=eq.${leagueId}` },
        async () => {
          // A standings row changed — refetch this league's ordered rows.
          const { data } = await supabase
            .from("league_standings")
            .select("user_id, points, rank, exact_count, profiles(display_name)")
            .eq("league_id", leagueId)
            .order("points", { ascending: false })
            .order("exact_count", { ascending: false })
            .order("user_id", { ascending: true });
          if (data) {
            setRows(
              data.map((s) => ({
                userId: s.user_id,
                displayName: (s.profiles as unknown as { display_name: string | null })?.display_name ?? "Guest",
                points: s.points,
                rank: s.rank,
                exactCount: s.exact_count,
              }))
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center">
        <div className="text-3xl">📊</div>
        <p className="mt-2 text-sm text-white/50">{t.leagues.noScores}</p>
      </div>
    );
  }

  const myIndex = meId != null ? rows.findIndex((r) => r.userId === meId) : -1;
  const me = myIndex >= 0 ? rows[myIndex] : null;

  return (
    <>
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const isMe = meId != null && r.userId === meId;
          return (
            <motion.li
              key={r.userId}
              layout
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={
                "flex items-center justify-between rounded-xl border px-4 py-3 " +
                (isMe
                  ? "border-[var(--bn-gold)]/50 bg-[var(--bn-gold)]/10"
                  : "border-white/10 bg-white/[0.03]")
              }
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid w-7 shrink-0 place-items-center text-center text-base font-extrabold text-[var(--bn-gold)]">
                  {MEDALS[i] ?? i + 1}
                </span>
                <span className="truncate font-semibold">
                  {r.displayName}
                  {isMe && <span className="ml-1.5 text-[10px] font-bold text-[var(--bn-gold)]">{t.leagues.yourPosition.toUpperCase()}</span>}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <span className="text-white/40">{t.leagues.exact(r.exactCount)}</span>
                <span className="font-black tabular-nums text-[var(--bn-gold)]">{r.points}</span>
              </span>
            </motion.li>
          );
        })}
      </ul>

      {/* Sticky "your position" bar — always know where you stand while scrolling. */}
      {me && (
        <div className="pointer-events-none sticky bottom-24 z-30 mt-2">
          <div className="pointer-events-auto flex items-center justify-between rounded-xl border border-[var(--bn-gold)]/60 bg-[#0c1730]/90 px-4 py-3 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.7)] backdrop-blur">
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid w-7 shrink-0 place-items-center text-center text-base font-extrabold text-[var(--bn-gold)]">
                {MEDALS[myIndex] ?? myIndex + 1}
              </span>
              <span className="truncate font-bold">
                {t.leagues.yourPosition} <span className="text-white/40">· {t.common.players(rows.length)}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3 text-sm">
              <span className="text-white/40">{t.leagues.exact(me.exactCount)}</span>
              <span className="font-black tabular-nums text-[var(--bn-gold)]">{me.points}</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
