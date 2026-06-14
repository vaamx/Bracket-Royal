/** Broadcast Night palette + motion tokens. Single source of truth for theme values. */
export const tokens = {
  color: {
    bg: "#0a1428",
    bgDeep: "#060c1a",
    surface: "rgba(255,255,255,0.04)",
    surfaceBorder: "rgba(255,255,255,0.12)",
    gold: "#d4af37",
    goldBright: "#f4d56a",
    accent: "#7c5cff",
    success: "#4ade80",
    warn: "#facc15",
    text: "#e8edf7",
    textMuted: "#8694b3",
  },
  radius: { card: "16px", input: "10px", pill: "999px" },
  motion: { spring: { type: "spring", stiffness: 420, damping: 30 } },
} as const;
