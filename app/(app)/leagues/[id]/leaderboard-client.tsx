"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { StandingRow } from "@/lib/leaderboard/queries";

export function LeaderboardClient({ leagueId, initialRows }: { leagueId: string; initialRows: StandingRow[] }) {
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
    return <p className="py-10 text-center text-sm text-white/50">No scores yet — predictions are graded as results come in.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <motion.li
          key={r.userId}
          layout
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
        >
          <span className="flex items-center gap-3">
            <span className="w-6 text-center font-extrabold text-[var(--bn-gold)]">{i + 1}</span>
            <span className="font-semibold">{r.displayName}</span>
          </span>
          <span className="flex items-center gap-3 text-sm">
            <span className="text-white/40">{r.exactCount} exact</span>
            <span className="font-black tabular-nums text-[var(--bn-gold)]">{r.points}</span>
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
