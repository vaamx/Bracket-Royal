/** Badge keys (stored in achievements.badge_key) + display metadata. */
export const BADGES = {
  bullseye: { key: "bullseye", emoji: "🎯", label: "Bullseye", desc: "Nailed an exact scoreline" },
  sharpshooter: { key: "sharpshooter", emoji: "🎯", label: "Sharpshooter", desc: "5+ exact scorelines" },
  perfect_group: { key: "perfect_group", emoji: "🧩", label: "Perfect Group", desc: "Every match in a group spot-on" },
  hot_streak: { key: "hot_streak", emoji: "🔥", label: "On Fire", desc: "3 exact scorelines in a row" },
  oracle: { key: "oracle", emoji: "🔮", label: "Oracle", desc: "Called the champion" },
} as const;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_LIST = Object.values(BADGES);
