import { describe, it, expect } from "vitest";
import { hashIp, parseUserAgent, contextFromHeaders } from "@/lib/analytics/context";

describe("hashIp", () => {
  it("is deterministic and salt-dependent", () => {
    expect(hashIp("1.2.3.4", "s")).toBe(hashIp("1.2.3.4", "s"));
    expect(hashIp("1.2.3.4", "s")).not.toBe(hashIp("1.2.3.4", "other"));
    expect(hashIp("1.2.3.4", "s")).toHaveLength(64); // sha256 hex
  });
});

describe("parseUserAgent", () => {
  it("flags bots", () => {
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").isBot).toBe(true);
    expect(parseUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)").device).toBe("bot");
  });
  it("detects mobile + iOS + Safari", () => {
    const r = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1");
    expect(r.device).toBe("mobile");
    expect(r.os).toBe("iOS");
  });
  it("defaults to desktop with no UA", () => {
    expect(parseUserAgent(null)).toEqual({ device: "desktop", browser: null, os: null, isBot: false });
  });
});

describe("contextFromHeaders", () => {
  it("parses IP, geo, UA, and language; hashes IP when salt given", () => {
    const h = new Headers({
      "x-forwarded-for": "9.9.9.9, 10.0.0.1",
      "x-vercel-ip-country": "US",
      "x-vercel-ip-country-region": "TX",
      "x-vercel-ip-city": "San%20Antonio",
      "user-agent": "Mozilla/5.0 (iPhone) Safari",
      "accept-language": "es-MX,es;q=0.9",
    });
    const ctx = contextFromHeaders(h, "salt");
    expect(ctx.ip).toBe("9.9.9.9");           // first hop only
    expect(ctx.ipHash).toBe(hashIp("9.9.9.9", "salt"));
    expect(ctx.country).toBe("US");
    expect(ctx.region).toBe("TX");
    expect(ctx.city).toBe("San Antonio");     // URL-decoded
    expect(ctx.device).toBe("mobile");
    expect(ctx.language).toBe("es-MX");
  });
  it("yields null ipHash when no IP", () => {
    expect(contextFromHeaders(new Headers(), "salt").ipHash).toBeNull();
  });
});
