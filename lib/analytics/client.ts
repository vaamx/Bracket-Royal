"use client";

type Props = Record<string, unknown>;

function readUtm(): Record<string, string | null> {
  const p = new URLSearchParams(window.location.search);
  return {
    source: p.get("utm_source"),
    medium: p.get("utm_medium"),
    campaign: p.get("utm_campaign"),
    term: p.get("utm_term"),
    content: p.get("utm_content"),
  };
}

/** Fire-and-forget analytics ping. Never throws into the UI. */
export function track(name: string, props: Props = {}): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      name,
      props,
      path: window.location.pathname,
      referrer: document.referrer || null,
      language: navigator.language || null,
      utm: readUtm(),
    });
    fetch("/api/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never break the UI for analytics */
  }
}
