"use client";

import { useState } from "react";
import { enablePush, savePrefs, pushSupported } from "@/lib/notify/subscribe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function SettingsClient({
  userId, initialPush, initialEmail, initialAddr,
}: {
  userId: string;
  initialPush: boolean;
  initialEmail: boolean;
  initialAddr: string | null;
}) {
  const [push, setPush] = useState(initialPush);
  const [email, setEmail] = useState(initialEmail);
  const [addr, setAddr] = useState(initialAddr ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function togglePush() {
    if (!push) {
      const ok = await enablePush(userId);
      if (!ok) { setStatus("Push unavailable (permission denied or not configured)."); return; }
    }
    const next = !push;
    setPush(next);
    await savePrefs(userId, { push: next, email, email_addr: addr || null });
    setStatus("Saved.");
  }

  async function saveEmail() {
    setEmail(true);
    await savePrefs(userId, { push, email: true, email_addr: addr || null });
    setStatus("Saved.");
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">Push notifications</h2>
        <p className="text-sm text-white/60">Get a nudge before a match you haven&apos;t predicted locks.</p>
        {pushSupported() ? (
          <Button onClick={togglePush} variant={push ? "ghost" : "gold"}>{push ? "Disable push" : "Enable push"}</Button>
        ) : (
          <p className="text-xs text-white/40">Push isn&apos;t supported in this browser.</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">Email reminders</h2>
        <Input type="email" placeholder="you@example.com" value={addr} onChange={(e) => setAddr(e.target.value)} />
        <Button onClick={saveEmail} disabled={!addr}>Save email reminders</Button>
        {email && <p className="text-xs text-[var(--bn-success)]">Email reminders on.</p>}
      </Card>

      {status && <p className="text-center text-xs text-white/50">{status}</p>}
    </div>
  );
}
