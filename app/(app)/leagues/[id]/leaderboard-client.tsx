"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { sortStandingRows, type StandingRow } from "@/lib/leaderboard/types";
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

  // Refetch the full merged member set (members + profiles + standings) — mirrors
  // the server query so brand-new members show immediately with 0 points.
  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data: members } = await supabase.from("league_members").select("user_id").eq("league_id", leagueId);
    const userIds = (members ?? []).map((m) => m.user_id);
    if (userIds.length === 0) return;
    const [{ data: profiles }, { data: standings }] = await Promise.all([
      supabase.from("profiles").select("id, display_name").in("id", userIds),
      supabase.from("league_standings").select("user_id, points, rank, exact_count").eq("league_id", leagueId),
    ]);
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]));
    const standByUser = new Map((standings ?? []).map((s) => [s.user_id, s]));
    setRows(sortStandingRows(userIds.map((uid) => {
      const s = standByUser.get(uid);
      return { userId: uid, displayName: nameById.get(uid) ?? null, points: s?.points ?? 0, rank: s?.rank ?? null, exactCount: s?.exact_count ?? 0 };
    })));
  }, [leagueId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`league:${leagueId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_standings", filter: `league_id=eq.${leagueId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "league_members", filter: `league_id=eq.${leagueId}` }, refetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId, refetch]);

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
                  {r.displayName ?? t.common.guest}
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
