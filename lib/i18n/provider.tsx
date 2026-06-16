"use client";

import { createContext, useContext } from "react";
import { en, type Dictionary } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import type { Locale } from "./locales";

// Dictionaries are plain client-safe modules (no server-only imports), so the
// provider looks them up by locale here. The dictionary holds functions for
// interpolation, which CANNOT be passed as props across the server→client
// boundary — so we only pass the `locale` string in.
const DICTS: Record<Locale, Dictionary> = { en, es };

interface I18nValue {
  t: Dictionary;
  locale: Locale;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ t: DICTS[locale], locale }}>{children}</I18nContext.Provider>;
}

/** Translations + active locale for client components. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within <I18nProvider>");
  return value;
}
