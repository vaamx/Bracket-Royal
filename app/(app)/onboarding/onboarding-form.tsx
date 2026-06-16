"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { setDisplayName } from "@/app/(app)/leagues/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useI18n } from "@/lib/i18n/provider";

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const intro = [
    { icon: "🏆", eyebrow: t.onboarding.stepWelcomeEyebrow, title: t.onboarding.stepWelcomeTitle, body: t.onboarding.stepWelcomeBody },
    { icon: "🔮", eyebrow: null, title: t.onboarding.stepPredictTitle, body: t.onboarding.stepPredictBody },
    { icon: "🗺️", eyebrow: null, title: t.onboarding.stepBracketTitle, body: t.onboarding.stepBracketBody },
  ];
  const total = intro.length + 1; // + name step
  const isName = step === intro.length;

  async function finish() {
    setSaving(true);
    setError(null);
    const fd = new FormData();
    fd.set("display_name", name.trim() || t.common.player);
    const res = await setDisplayName(fd);
    setSaving(false);
    if (res?.error) setError(res.error);
    else router.push("/predict");
  }

  return (
    <div className="w-full">
      {/* Progress dots */}
      <div className="mb-6 flex justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={"h-1.5 rounded-full transition-all " + (i === step ? "w-6 bg-[var(--bn-gold)]" : "w-1.5 bg-white/20")}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {!isName ? (
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col items-center text-center"
          >
            <div className="bn-float mb-5 text-6xl drop-shadow-[0_8px_30px_rgba(212,175,55,0.4)]">{intro[step].icon}</div>
            {intro[step].eyebrow && (
              <p className="text-xs font-bold tracking-[2px] text-[var(--bn-accent)]">{intro[step].eyebrow}</p>
            )}
            <h1 className="mt-1 text-3xl font-black">{intro[step].title}</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">{intro[step].body}</p>
          </motion.div>
        ) : (
          <motion.div
            key="name"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col items-center text-center"
          >
            <div className="mb-5 text-6xl">✍️</div>
            <h1 className="text-3xl font-black">{t.onboarding.stepNameTitle}</h1>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">{t.onboarding.stepNameBody}</p>
            <Input
              className="mt-5 text-center"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.onboarding.namePlaceholder}
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="mt-9 flex flex-col gap-3">
        {isName ? (
          <Button className="w-full" disabled={saving} onClick={finish}>
            {saving ? t.common.saving : t.onboarding.finish}
          </Button>
        ) : (
          <Button className="w-full" onClick={() => setStep((s) => s + 1)}>
            {step === 0 ? t.onboarding.getStarted : t.onboarding.next}
          </Button>
        )}
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="font-semibold text-white/45 transition-colors hover:text-white/75 disabled:opacity-0"
          >
            ← {t.onboarding.back}
          </button>
          <button
            onClick={() => router.push("/predict")}
            className="font-semibold text-white/45 transition-colors hover:text-white/75"
          >
            {t.onboarding.skip}
          </button>
        </div>
      </div>
    </div>
  );
}
