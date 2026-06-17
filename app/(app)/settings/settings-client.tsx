"use client";

import { useEffect, useState } from "react";
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
  // pushSupported() reads navigator/window → differs SSR vs client. Resolve it
  // after mount so SSR and first client render agree (no hydration mismatch).
  const [pushOk, setPushOk] = useState<boolean | null>(null);
  useEffect(() => setPushOk(pushSupported()), []);
  const { t, locale } = useI18n();

  async function togglePush() {
    if (!push) {
      const ok = await enablePush(userId);
      if (!ok) { setStatus(t.settings.pushUnavailable); return; }
    }
    const next = !push;
    setPush(next);
    await savePrefs(userId, { push: next, email, email_addr: addr || null, locale });
    setStatus(t.settings.saved);
  }

  async function saveEmail() {
    setEmail(true);
    await savePrefs(userId, { push, email: true, email_addr: addr || null, locale });
    setStatus(t.settings.saved);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h2 className="font-bold">{t.settings.notifPush}</h2>
        <p className="text-sm text-white/60">{t.settings.notifPushDesc}</p>
        {pushOk === false ? (
          <p className="text-xs text-white/40">{t.settings.pushUnsupported}</p>
        ) : (
          <Button onClick={togglePush} variant={push ? "ghost" : "gold"}>{push ? t.settings.pushDisable : t.settings.pushEnable}</Button>
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
