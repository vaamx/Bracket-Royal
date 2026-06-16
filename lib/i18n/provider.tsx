"use client";

import { createContext, useContext } from "react";
import type { Dictionary } from "./dictionaries/en";
import type { Locale } from "./locales";

interface I18nValue {
  t: Dictionary;
  locale: Locale;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({
  locale, dict, children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={{ t: dict, locale }}>{children}</I18nContext.Provider>;
}

/** Translations + active locale for client components. */
export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within <I18nProvider>");
  return value;
}
