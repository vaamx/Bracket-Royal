"use client";

import { useState } from "react";

export function InviteShare({ code, leagueName }: { code: string; leagueName: string }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  function joinUrl() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/leagues?code=${code}`;
  }

  async function copy(what: "code" | "link") {
    const text = what === "code" ? code : joinUrl();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  async function share() {
    const url = joinUrl();
    const text = `Join my World Cup 2026 bracket league "${leagueName}" — code ${code}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Bracket Royale", text, url });
        return;
      } catch {
        /* user cancelled or unsupported — fall through to copy */
      }
    }
    copy("link");
  }

  return (
    <div className="rounded-2xl border border-[var(--bn-gold)]/30 bg-gradient-to-b from-[var(--bn-gold)]/10 to-transparent p-4">
      <p className="text-xs font-bold uppercase tracking-[1.5px] text-[var(--bn-gold)]">Invite friends</p>
      <p className="mt-1 text-sm text-white/65">Share this code or link — friends join instantly and appear on the leaderboard.</p>

      <button
        onClick={() => copy("code")}
        className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 transition-colors hover:bg-white/[0.07]"
      >
        <span className="font-mono text-2xl font-black tracking-[4px] text-[var(--bn-gold)]">{code}</span>
        <span className="text-xs font-bold text-white/55">{copied === "code" ? "Copied ✓" : "Tap to copy"}</span>
      </button>

      <div className="mt-2 flex gap-2">
        <button
          onClick={share}
          className="flex-1 rounded-full bg-gradient-to-r from-[#d4af37] to-[#f4d56a] px-4 py-2.5 text-sm font-extrabold text-[#0a1428]"
        >
          Share invite
        </button>
        <button
          onClick={() => copy("link")}
          className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-bold text-white/75 hover:bg-white/5"
        >
          {copied === "link" ? "Link copied ✓" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
