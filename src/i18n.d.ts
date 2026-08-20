/**
 * Types for src/i18n.js, which is CommonJS shared with the Express side.
 *
 * Hand-written rather than inferred: the implementation is a ~1600-line
 * dictionary, and letting TypeScript walk it on every build costs time while
 * telling us nothing we do not already know about its surface.
 *
 * Only the members the Next.js pages use are declared here. Add to this file
 * when you reach for another one.
 */
declare module "@/src/i18n" {
  export const copy: Record<string, Record<string, string>>;
  export const languageDefinitions: Record<string, { code: string; label: string }>;
  export const marketLanguages: Record<string, string[]>;
  export const defaultLanguages: Record<string, string>;

  /** Returns "" when the value is not a language this site is translated into. */
  export function normalizeLanguage(value: unknown): string;
  export function languagesForMarket(marketCode: string): string[];
  /** Falls back to English per key, so a partial language degrades word by word. */
  export function t(
    language: string,
    key: string,
    variables?: Record<string, string | number>,
  ): string;
  /** "en-US", "fr-FR", "de-DE" — for the lang attribute and hreflang. */
  export function languageTag(marketCode: string, language: string): string;
  export function marketName(marketCode: string, language: string): string;
  export function categoryLabel(category: string, language: string): string;
}
