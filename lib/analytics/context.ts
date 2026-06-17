import crypto from "node:crypto";

export type Utm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  term: string | null;
  content: string | null;
};

export type AnalyticsContext = {
  ip: string | null;
  ipHash: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  userAgent: string | null;
  device: "mobile" | "tablet" | "desktop" | "bot";
  browser: string | null;
  os: string | null;
  isBot: boolean;
  referrer: string | null;
  utm: Utm;
  language: string | null;
};

export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

const BOT_RE =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|headless|monitoring|pingdom|lighthouse|gtmetrix|axios|curl|wget|python-requests|node-fetch/i;

export function parseUserAgent(ua: string | null): {
  device: AnalyticsContext["device"];
  browser: string | null;
  os: string | null;
  isBot: boolean;
} {
  if (!ua) return { device: "desktop", browser: null, os: null, isBot: false };
  const isBot = BOT_RE.test(ua);
  const device: AnalyticsContext["device"] = isBot
    ? "bot"
    : /ipad|tablet/i.test(ua)
      ? "tablet"
      : /mobile|iphone|android/i.test(ua)
        ? "mobile"
        : "desktop";
  const browser = /edg/i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : null;
  const os = /windows/i.test(ua)
    ? "Windows"
    : /iphone|ipad|ios|ipod/i.test(ua)
      ? "iOS"
      : /mac os/i.test(ua)
        ? "macOS"
        : /android/i.test(ua)
          ? "Android"
          : /linux/i.test(ua)
            ? "Linux"
            : null;
  return { device, browser, os, isBot };
}

function safeDecode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

// Pure: the salt is passed in by the (server-side) caller, never read from
// process.env here, so this module stays unit-testable in isolation.
export function contextFromHeaders(headers: Headers, salt?: string): AnalyticsContext {
  const theSalt = salt ?? "";
  const fwd = headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0]?.trim() || headers.get("x-real-ip") || "").trim() || null;
  const ua = headers.get("user-agent");
  const { device, browser, os, isBot } = parseUserAgent(ua);
  return {
    ip,
    ipHash: ip && theSalt ? hashIp(ip, theSalt) : null,
    country: headers.get("x-vercel-ip-country"),
    region: headers.get("x-vercel-ip-country-region"),
    city: safeDecode(headers.get("x-vercel-ip-city")),
    userAgent: ua,
    device,
    browser,
    os,
    isBot,
    referrer: headers.get("referer"),
    utm: { source: null, medium: null, campaign: null, term: null, content: null },
    language: (headers.get("accept-language") || "").split(",")[0]?.trim() || null,
  };
}
