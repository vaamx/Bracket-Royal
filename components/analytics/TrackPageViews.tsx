"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics/client";

/** Fires a page_view (and refreshes last_seen) on every path change. Renders nothing. */
export function TrackPageViews() {
  const pathname = usePathname();
  useEffect(() => {
    track("page_view", {});
  }, [pathname]);
  return null;
}
