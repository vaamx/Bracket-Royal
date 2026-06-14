"use client";

import { motion } from "framer-motion";
import type { TeamStanding } from "@/lib/math";
import type { PredictTeam } from "@/lib/predictions/types";

export function PredictedTable({
  rows,
  teamsById,
}: {
  rows: TeamStanding[];
  teamsById: Record<string, PredictTeam>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2">
      <div className="grid grid-cols-[1.4rem_1fr_2rem_2rem_2rem] gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-white/40">
        <span>#</span><span>Team</span><span className="text-center">P</span><span className="text-center">GD</span><span className="text-center">Pts</span>
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => {
          const t = teamsById[r.teamId];
          const qualifies = i < 2;
          return (
            <motion.li
              key={r.teamId}
              layout
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className={
                "grid grid-cols-[1.4rem_1fr_2rem_2rem_2rem] items-center gap-1 rounded-lg px-2 py-2 text-sm " +
                (qualifies ? "bg-[var(--bn-success)]/10 border-l-2 border-[var(--bn-success)]" : "bg-white/[0.02]")
              }
            >
              <span className="text-white/50 font-bold">{i + 1}</span>
              <span className="flex items-center gap-2 truncate">
                <span aria-hidden>{t?.flag ?? "🏳️"}</span>
                <span className="truncate">{t?.name ?? r.teamId}</span>
              </span>
              <span className="text-center text-white/70 tabular-nums">{r.played}</span>
              <span className="text-center text-white/70 tabular-nums">{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</span>
              <span className="text-center font-extrabold text-[var(--bn-gold)] tabular-nums">{r.points}</span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
