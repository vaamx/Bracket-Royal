"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDisplayName } from "@/app/(app)/leagues/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n/provider";

/** Set/change your display name — works for guests too (no account needed). */
export function NameEditor({ initialName }: { initialName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.set("display_name", trimmed);
    start(async () => {
      const res = await setDisplayName(fd);
      if (!res?.error) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-bold text-white/70">{t.settings.yourName}</p>
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.settings.namePlaceholder}
          maxLength={24}
        />
        <Button onClick={save} disabled={pending || !name.trim()}>
          {saved ? t.settings.saved : pending ? t.common.saving : t.common.save}
        </Button>
      </div>
      <p className="text-[11px] text-white/40">{t.settings.nameHint}</p>
    </div>
  );
}
