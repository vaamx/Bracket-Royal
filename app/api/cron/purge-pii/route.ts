import { NextResponse } from "next/server";
import { purgeExpiredIps } from "@/lib/analytics/track";

export const dynamic = "force-dynamic";

/** CRON_SECRET-guarded retention: nulls raw IPs older than 90 days (keeps ip_hash + geo). */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const purged = await purgeExpiredIps(90);
    return NextResponse.json({ purged });
  } catch (e) {
    const message = e instanceof Error ? e.message : "purge failed";
    console.error("cron/purge-pii failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
