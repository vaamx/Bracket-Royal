"use client";

import { useMemo } from "react";
import { KNOCKOUT_MATCHES, KNOCKOUT_BY_ID } from "@/lib/bracket/structure";
import type { BracketTeam } from "@/lib/bracket/queries";
import type { BracketSlotView } from "@/lib/bracket/userBracket";
import { useI18n } from "@/lib/i18n/provider";

// Layout geometry (px). The canvas is fixed-size and pans inside a scroll box.
const COLW = 132;
const CARD_W = 116;
const CARD_H = 56;
const PAD_X = (COLW - CARD_W) / 2;
const SLOT_R32 = 70;
const HEADER_H = 28;
const STAGES = ["r32", "r16", "qf", "sf", "final"] as const;

/** Post-order DFS from the final so each stage's list is top-to-bottom and a
 *  parent at index j is always fed by children 2j (home) and 2j+1 (away). */
function useLayout() {
  return useMemo(() => {
    const feeders = new Map<string, { home?: string; away?: string }>();
    for (const m of KNOCKOUT_MATCHES) {
      if (m.winnerTo) {
        const e = feeders.get(m.winnerTo.matchId) ?? {};
        e[m.winnerTo.side] = m.id;
        feeders.set(m.winnerTo.matchId, e);
      }
    }
    const order: Record<string, string[]> = {};
    const visit = (id: string) => {
      const m = KNOCKOUT_BY_ID.get(id)!;
      const f = feeders.get(id);
      if (f?.home) visit(f.home);
      if (f?.away) visit(f.away);
      (order[m.stage] ??= []).push(id);
    };
    visit("F-1");
    const totalH = order.r32.length * SLOT_R32;
    return { order, totalH };
  }, []);
}

function Chip({
  teamId, team, picked, dimmed, locked, onPick,
}: {
  teamId?: string;
  team?: BracketTeam;
  picked: boolean;
  dimmed: boolean;
  locked: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={locked || !teamId}
      onClick={onPick}
      className={
        "flex h-[26px] w-full items-center gap-1.5 rounded-md px-1.5 text-left transition-colors " +
        (picked
          ? "bg-[var(--bn-gold)]/20 text-white"
          : "text-white/75 hover:bg-white/[0.06]") +
        (dimmed ? " opacity-40" : "")
      }
    >
      <span className="text-sm leading-none" aria-hidden>{team?.flag ?? "·"}</span>
      <span className={"truncate text-[11px] " + (picked ? "font-black text-[var(--bn-gold)]" : "font-bold")}>
        {teamId ?? "—"}
      </span>
    </button>
  );
}

export function BracketTree({
  view, teams, locks, onPick,
}: {
  view: Record<string, BracketSlotView>;
  teams: Record<string, BracketTeam>;
  locks: Record<string, boolean>;
  onPick: (matchId: string, teamId: string) => void;
}) {
  const { t } = useI18n();
  const { order, totalH } = useLayout();
  const STAGE_LABELS: Record<string, string> = {
    r32: t.bracket.roundOf32, r16: t.bracket.roundOf16, qf: t.bracket.quarters,
    sf: t.bracket.semis, final: t.bracket.final,
  };

  const colCount = STAGES.length;
  const champW = 120;
  const W = colCount * COLW + champW;

  const champion = view["F-1"]?.pick;

  const slotH = (stageIdx: number) => totalH / order[STAGES[stageIdx]].length;
  const centerY = (stageIdx: number, i: number) => HEADER_H + i * slotH(stageIdx) + slotH(stageIdx) / 2;
  const cardLeft = (stageIdx: number) => stageIdx * COLW + PAD_X;
  const cardRight = (stageIdx: number) => cardLeft(stageIdx) + CARD_W;
  const canvasH = totalH + HEADER_H;

  // SVG connector polylines from each feeder into its parent. A connector whose
  // feeder was won by the eventual champion gets the bright "road to glory" trail.
  const connectors: Array<{ d: string; active: boolean; champ: boolean }> = [];
  for (let s = 0; s < colCount - 1; s++) {
    const ids = order[STAGES[s]];
    ids.forEach((fid, i) => {
      const parentI = Math.floor(i / 2);
      const x1 = cardRight(s);
      const y1 = centerY(s, i);
      const x2 = cardLeft(s + 1);
      const y2 = centerY(s + 1, parentI);
      const midX = (x1 + x2) / 2;
      const pick = view[fid]?.pick;
      connectors.push({
        d: `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`,
        active: pick !== undefined,
        champ: champion !== undefined && pick === champion,
      });
    });
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div
        className="relative rounded-2xl border border-white/10 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(124,92,255,0.10),transparent_60%)]"
        style={{ width: W, height: canvasH }}
      >
        {/* round headers */}
        {STAGES.map((stage, s) => (
          <div
            key={stage}
            className="absolute text-center text-[10px] font-bold uppercase tracking-wide text-white/40"
            style={{ left: cardLeft(s), top: 6, width: CARD_W }}
          >
            {STAGE_LABELS[stage]}
          </div>
        ))}

        {/* connectors */}
        <svg className="pointer-events-none absolute inset-0" width={W} height={canvasH} fill="none">
          {connectors.map((c, k) => (
            <path
              key={k}
              d={c.d}
              stroke={c.champ ? "var(--bn-gold-bright)" : c.active ? "var(--bn-gold)" : "rgba(255,255,255,0.14)"}
              strokeWidth={c.champ ? 2.5 : c.active ? 2 : 1.5}
            />
          ))}
        </svg>

        {/* match cards */}
        {STAGES.map((stage, s) =>
          order[stage].map((id, i) => {
            const v = view[id] ?? {};
            const decided = v.pick !== undefined;
            const isChampTie = champion !== undefined && v.pick === champion;
            const top = centerY(s, i) - CARD_H / 2;
            return (
              <div
                key={id}
                className={
                  "absolute flex flex-col justify-center rounded-lg border bg-[#0c1730]/80 backdrop-blur-sm " +
                  (isChampTie
                    ? "border-[var(--bn-gold)] shadow-[0_0_16px_-6px_rgba(244,213,106,0.8)]"
                    : decided ? "border-[var(--bn-gold)]/45" : "border-white/10")
                }
                style={{ left: cardLeft(s), top, width: CARD_W, height: CARD_H }}
              >
                <Chip
                  teamId={v.homeTeamId} team={v.homeTeamId ? teams[v.homeTeamId] : undefined}
                  picked={decided && v.pick === v.homeTeamId} dimmed={decided && v.pick !== v.homeTeamId}
                  locked={locks[id] ?? false} onPick={() => v.homeTeamId && onPick(id, v.homeTeamId)}
                />
                <div className="mx-1.5 h-px bg-white/10" />
                <Chip
                  teamId={v.awayTeamId} team={v.awayTeamId ? teams[v.awayTeamId] : undefined}
                  picked={decided && v.pick === v.awayTeamId} dimmed={decided && v.pick !== v.awayTeamId}
                  locked={locks[id] ?? false} onPick={() => v.awayTeamId && onPick(id, v.awayTeamId)}
                />
              </div>
            );
          })
        )}

        {/* champion */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: colCount * COLW, top: HEADER_H + totalH / 2 - 44, width: champW }}
        >
          <div className={champion ? "text-3xl drop-shadow-[0_4px_16px_rgba(244,213,106,0.6)]" : "text-3xl opacity-50"}>🏆</div>
          <div
            className={
              "mt-1 w-full truncate rounded-lg border px-2 py-1.5 text-center text-xs font-black " +
              (champion ? "border-[var(--bn-gold)] bg-[var(--bn-gold)]/15 text-[var(--bn-gold)]" : "border-white/10 text-white/30")
            }
          >
            {champion ? `${teams[champion]?.flag ?? ""} ${champion}` : t.bracket.champion}
          </div>
        </div>
      </div>
    </div>
  );
}
