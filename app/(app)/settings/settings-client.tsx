"use client";

import { useState } from "react";
import { enablePush, savePrefs, pushSupported } from "@/lib/notify/subscribe";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/provider";

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
  const { t } = useI18n();

  async function togglePush() {
    if (!push) {
      const ok = await enablePush(userId);
      if (!ok) { setStatus(t.settings.pushUnavailable); return; }
    }
    const next = !push;
    setPush(next);
    await savePrefs(userId, { push: next, email, email_addr: addr || null });
    setStatus(t.settings.saved);
  }

  async function saveEmail() {
    setEmail(true);
    await savePrefs(userId, { push, email: true, email_addr: addr || null });
    setStatus(t.settings.saved);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">{t.settings.notifPush}</h2>
        <p className="text-sm text-white/60">{t.settings.notifPushDesc}</p>
        {pushSupported() ? (
          <Button onClick={togglePush} variant={push ? "ghost" : "gold"}>{push ? t.settings.pushDisable : t.settings.pushEnable}</Button>
        ) : (
          <p className="text-xs text-white/40">{t.settings.pushUnsupported}</p>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-bold">{t.settings.emailTitle}</h2>
        <Input type="email" placeholder={t.settings.emailPlaceholder} value={addr} onChange={(e) => setAddr(e.target.value)} />
        <Button onClick={saveEmail} disabled={!addr}>{t.settings.emailSave}</Button>
        {email && <p className="text-xs text-[var(--bn-success)]">{t.settings.emailOn}</p>}
      </Card>

      {status && <p className="text-center text-xs text-white/50">{status}</p>}
    </div>
  );
}
