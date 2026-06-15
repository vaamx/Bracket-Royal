"use client";

import { useCallback } from "react";

const MUTE_KEY = "wc26-mute";

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}
export function setMuted(muted: boolean): void {
  if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/** Confetti burst + a short haptic, unless the user has muted celebrations. */
export function useCelebration() {
  return useCallback(async (intensity: "small" | "big" = "small") => {
    if (isMuted()) return;
    // Celebration is non-critical — never let it crash the app (CSP, no canvas, etc.).
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(intensity === "big" ? [20, 40, 20] : 15);
      }
      const confetti = (await import("canvas-confetti")).default;
      const count = intensity === "big" ? 200 : 60;
      confetti({ particleCount: count, spread: intensity === "big" ? 100 : 60, origin: { y: 0.7 }, colors: ["#d4af37", "#f4d56a", "#7c5cff", "#ffffff"] });
    } catch {
      /* swallow — celebration is best-effort */
    }
  }, []);
}
