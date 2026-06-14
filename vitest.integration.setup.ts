// Node 20 lacks a native global WebSocket, which @supabase/supabase-js needs to
// construct its RealtimeClient. Provide a polyfill for the integration run only.
import ws from "ws";

if (typeof globalThis.WebSocket === "undefined") {
  // @ts-expect-error -- ws's constructor is compatible enough for the client init.
  globalThis.WebSocket = ws;
}
