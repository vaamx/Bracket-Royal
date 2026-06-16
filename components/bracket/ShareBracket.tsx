"use client";

import { useState } from "react";

export function ShareBracket({
  championName, championFlag, runnerUpName, runnerUpFlag,
}: {
  championName: string;
  championFlag: string;
  runnerUpName?: string;
  runnerUpFlag?: string;
}) {
  const [copied, setCopied] = useState(false);

  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text =
    `🏆 My World Cup 2026 pick: ${championFlag} ${championName} lifts the trophy` +
    (runnerUpName ? `, beating ${runnerUpFlag ?? ""} ${runnerUpName} in the final.` : ".") +
    ` Build your bracket on Bracket Royale!`;

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Bracket Royale", text, url });
        return;
      } catch {
        /* cancelled / unsupported — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <button
      onClick={share}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--bn-gold)]/40 bg-[var(--bn-gold)]/10 px-4 py-3 text-sm font-extrabold text-[var(--bn-gold)] transition-colors hover:bg-[var(--bn-gold)]/15 active:scale-[0.99]"
    >
      <span aria-hidden>📣</span>
      {copied ? "Copied to clipboard ✓" : `Share my bracket — ${championFlag} ${championName}`}
    </button>
  );
}
