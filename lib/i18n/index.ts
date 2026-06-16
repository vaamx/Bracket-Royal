import { cookies, headers } from "next/headers";
import { en, type Dictionary } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { defaultLocale, isLocale, type Locale } from "./locales";

export type { Dictionary };
export { type Locale } from "./locales";

export const LOCALE_COOKIE = "locale";

const DICTS: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return DICTS[locale];
}

/** Resolve the active locale: explicit cookie first, else Accept-Language, else default. */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  // First language tag wins; treat es-* as Spanish.
  const first = accept.split(",")[0]?.trim() ?? "";
  if (first.startsWith("es")) return "es";
  return defaultLocale;
}

/** Convenience for server components: the active locale + its dictionary. */
export async function getT(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
