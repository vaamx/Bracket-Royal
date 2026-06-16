"use client";

import { useEffect, useState } from "react";

/**
 * Renders a kickoff timestamp in the viewer's local timezone. Formatting is
 * done after mount (locale/timezone differ between server and client), so SSR
 * and first client render both show a stable placeholder — no hydration drift.
 */
export function KickoffTime({ iso }: { iso: string | null }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) return;
    setLabel(
      new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }, [iso]);

  if (!iso) return null;
  return <span suppressHydrationWarning>{label ?? "Kickoff TBD"}</span>;
}
