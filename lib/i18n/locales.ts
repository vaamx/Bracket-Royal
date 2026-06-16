export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "es";
}
