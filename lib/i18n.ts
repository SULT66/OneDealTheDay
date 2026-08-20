import { headers } from "next/headers";
import {
  t as translate,
  marketName,
  languagesForMarket,
  languageDefinitions,
  defaultLanguages,
  languageTag,
  normalizeLanguage,
} from "@/src/i18n";

/**
 * Language for the Next.js pages.
 *
 * The Express server in front of these pages already resolves the market and
 * the language for every request — from the path, the `?lang=` parameter, the
 * saved `odd_lang_<market>` cookie, and the market's own default, in that
 * order. A server component has no access to `req`, so src/server.js copies
 * both onto request headers and this module reads them back.
 *
 * The browser's own Accept-Language is deliberately not part of that chain: a
 * German visitor gets German because the market is Germany, not because of the
 * language their operating system happens to be installed in. Switching is an
 * explicit act, and it is remembered.
 *
 * Falling back to the market default here matters — `next build` renders these
 * components with no request at all, and the fallback is what keeps that from
 * throwing.
 */
export type Language = "en" | "es" | "fr" | "de";

export type LanguageOption = { code: string; label: string; current: boolean };

export async function getLanguage(market: string): Promise<Language> {
  const header = await headers();
  const fromServer = normalizeLanguage(header.get("x-odd-language") ?? "");
  if (fromServer && languagesForMarket(market).includes(fromServer)) {
    return fromServer as Language;
  }
  return (defaultLanguages[market] ?? "en") as Language;
}

/**
 * `t(language, key)` with the variable substitution the Express side already
 * uses: `t(lang, "app.home.checkedCount", { count: 12 })`.
 */
export function t(
  language: string,
  key: string,
  variables: Record<string, string | number> = {},
): string {
  return translate(language, key, variables);
}

/** Language options for this market, for the switcher in the footer. */
export function languageOptions(market: string, current: string): LanguageOption[] {
  return languagesForMarket(market).map((code: string) => ({
    code,
    label: languageDefinitions[code]?.label ?? code,
    current: code === current,
  }));
}

/** `en-US`, `fr-FR`, `de-DE` — for the `lang` attribute and hreflang. */
export function tagFor(market: string, language: string): string {
  return languageTag(market, language);
}

/**
 * The country's name in the visitor's language — "États-Unis" rather than
 * "United States" on a French page. markets.json only carries the English
 * name, which is fine for configuration but wrong to print.
 */
export function countryName(market: string, language: string): string {
  return marketName(market, language);
}

/** A market with more than one language needs a switcher; the UK does not. */
export function hasLanguageChoice(market: string): boolean {
  return languagesForMarket(market).length > 1;
}
