"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLeague, joinLeague } from "@/app/(app)/leagues/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/provider";
import type { Dictionary } from "@/lib/i18n";

function errText(code: string | undefined, t: Dictionary): string {
  switch (code) {
    case "name_required": return t.leagues.errName;
    case "code_required": return t.leagues.errCode;
    case "not_found": return t.leagues.errNotFound;
    default: return t.leagues.errGeneric;
  }
}

export function CreateLeagueForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await createLeague(formData);
      if ("ok" in res && res.id) router.push(`/leagues/${res.id}`);
      else setErr(errText((res as { error?: string }).error, t));
    });
  }

  return (
    <form action={submit} className="space-y-2">
      <div className="flex gap-2">
        <Input name="name" placeholder={t.leagues.leagueNamePlaceholder} maxLength={40} required />
        <Button type="submit" disabled={pending}>{pending ? t.leagues.creating : t.leagues.create}</Button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </form>
  );
}

export function JoinLeagueForm({ defaultCode = "", variant = "gold" }: { defaultCode?: string; variant?: "gold" | "ghost" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await joinLeague(formData);
      if ("ok" in res && res.id) router.push(`/leagues/${res.id}`);
      else setErr(errText((res as { error?: string }).error, t));
    });
  }

  return (
    <form action={submit} className="space-y-2">
      <div className="flex gap-2">
        <Input name="code" defaultValue={defaultCode} placeholder={t.leagues.enterCode} className="font-mono uppercase" required />
        <Button type="submit" variant={variant} disabled={pending}>{pending ? t.leagues.joining : t.leagues.join}</Button>
      </div>
      {err && <p className="text-sm text-red-400">{err}</p>}
    </form>
  );
}
