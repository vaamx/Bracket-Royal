"use client";

import type { BracketTeam } from "@/lib/bracket/queries";

function TeamRow({
  teamId, team, picked, dimmed, locked, onPick,
}: {
  teamId?: string;
  team?: BracketTeam;
  picked: boolean;
  dimmed: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  const label = team?.name ?? (teamId ? teamId : "—");
  return (
    <button
      disabled={locked || !teamId}
      onClick={onPick}
      className={
        "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors " +
        (picked
          ? "bg-[var(--bn-gold)]/15 border border-[var(--bn-gold)] font-extrabold text-white"
          : "border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.06]") +
        (dimmed ? " opacity-40" : "") +
        (locked || !teamId ? " cursor-default" : "")
      }
    >
      <span aria-hidden>{team?.flag ?? "•"}</span>
      <span className="truncate">{label}</span>
      {picked && <span className="ml-auto text-[var(--bn-gold)]">✓</span>}
    </button>
  );
}

export function TieCard({
  home, away, homeTeam, awayTeam, pick, locked, onPick,
}: {
  home?: string;
  away?: string;
  homeTeam?: BracketTeam;
  awayTeam?: BracketTeam;
  pick?: string;
  locked: boolean;
  onPick: (teamId: string) => void;
}) {
  const decided = pick !== undefined;
  return (
    <div className="space-y-1.5">
      <TeamRow teamId={home} team={homeTeam} picked={pick === home} dimmed={decided && pick !== home} locked={locked} onPick={() => home && onPick(home)} />
      <TeamRow teamId={away} team={awayTeam} picked={pick === away} dimmed={decided && pick !== away} locked={locked} onPick={() => away && onPick(away)} />
    </div>
  );
}
