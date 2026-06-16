export type KnockoutStage = "r32" | "r16" | "qf" | "sf" | "final" | "third";

/** Which qualifier fills an R32 slot. */
export type SlotSpec =
  | { kind: "winner"; group: string }    // 1st of group
  | { kind: "runner"; group: string }    // 2nd of group
  | { kind: "third"; cluster: string[] }; // a best-3rd from one of these groups (assigned by the official combination)

/** Where a match's winner (and, for semis, loser) flows next. */
export interface Feed {
  matchId: string;
  side: "home" | "away";
}

export interface KnockoutMatch {
  id: string;          // e.g. "R32-1", "F-1", "3RD-1"
  stage: KnockoutStage;
  /** R32 only: how its two qualifier slots are filled. */
  home?: SlotSpec;
  away?: SlotSpec;
  /** Winner advances here (null for the final / third-place). */
  winnerTo: Feed | null;
  /** Semis only: loser drops to the third-place playoff. */
  loserTo?: Feed;
}
