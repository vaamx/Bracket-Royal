"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setDisplayName } from "@/app/(app)/leagues/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function action(formData: FormData) {
    setSaving(true);
    setError(null);
    const res = await setDisplayName(formData);
    setSaving(false);
    if (res?.error) setError(res.error);
    else router.push("/leagues");
  }

  return (
    <Card className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Pick your name</h1>
        <p className="mt-1 text-sm text-white/60">This is how friends will see you on the leaderboard.</p>
      </div>
      <form action={action} className="space-y-3">
        <Input name="display_name" defaultValue={initialName} placeholder="Your display name" required />
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </form>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Card>
  );
}
