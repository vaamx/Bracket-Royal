import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchReminders } from "@/lib/notify/dispatch";

export const dynamic = "force-dynamic";

/** CRON_SECRET-guarded lock-reminder dispatch. No-ops cleanly without VAPID/Resend keys. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const { sent } = await dispatchReminders(createAdminClient());
    return NextResponse.json({ sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "notify failed";
    console.error("cron/notify failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
