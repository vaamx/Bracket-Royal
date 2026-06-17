import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contextFromHeaders } from "@/lib/analytics/context";
import { recordSession, recordEvent } from "@/lib/analytics/track";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only these names may be sent by the browser. signed_in / pick_saved are emitted
// server-side or by triggers and must never be spoofable from the client.
const CLIENT_EVENTS = new Set(["page_view", "start_predicting"]);

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!CLIENT_EVENTS.has(name)) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });

  const ctx = contextFromHeaders(request.headers, process.env.ANALYTICS_IP_SALT);
  if (typeof body.referrer === "string") ctx.referrer = body.referrer;
  if (typeof body.language === "string") ctx.language = body.language;
  const utm = body.utm as Record<string, unknown> | undefined;
  if (utm && typeof utm === "object") {
    ctx.utm = {
      source: typeof utm.source === "string" ? utm.source : null,
      medium: typeof utm.medium === "string" ? utm.medium : null,
      campaign: typeof utm.campaign === "string" ? utm.campaign : null,
      term: typeof utm.term === "string" ? utm.term : null,
      content: typeof utm.content === "string" ? utm.content : null,
    };
  }
  const path = typeof body.path === "string" ? body.path : null;
  const props = body.props && typeof body.props === "object" ? (body.props as Record<string, unknown>) : {};

  await recordSession(user.id, ctx);
  await recordEvent(user.id, name, props, path);
  return NextResponse.json({ ok: true });
}
