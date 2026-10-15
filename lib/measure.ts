/**
 * The six measurement events, as the pages call them.
 *
 * GA4 received page views and nothing else, so the only question it could
 * answer was how many people arrived. Everything the thirty-day content plan
 * turns on — which page sent somebody to a shop, whether search finds
 * anything, whether the assistant is used at all — had no number behind it.
 *
 * The transport lives in public/cookie-consent.js, which is the file that owns
 * `gtag` and knows whether a European visitor has agreed yet. This module is
 * the typed door onto it: one function, a closed set of names, and the rules
 * about what an event is allowed to say.
 *
 * What an event may never carry: an email address, a question somebody typed,
 * a URL with a query string on it, or anything else that identifies a person.
 * GA4 is a third party and these events are sent to it from the visitor's own
 * browser; the site's own tables (src/pageViews.js, the clicks table) are
 * where anything more detailed belongs.
 */

declare global {
  interface Window {
    oddEvent?: (name: string, values: Record<string, string | number | boolean>) => void;
  }
}

export type MeasuredEvent =
  | "view_item"
  | "search"
  | "delia_open"
  | "delia_query_submit"
  | "email_signup"
  | "retailer_click";

type Values = Record<string, string | number | boolean | null | undefined>;

/**
 * Report one event, or do nothing at all.
 *
 * Nothing about measurement is worth a broken page, so every failure here is
 * silent: no analytics loaded, consent refused, storage blocked, an extension
 * that removed the global. The call site never has to check.
 */
export function measure(name: MeasuredEvent, values: Values = {}) {
  try {
    const parameters: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === undefined || value === "") continue;
      parameters[key] = value;
    }
    window.oddEvent?.(name, parameters);
  } catch {
    /* Deliberately empty. */
  }
}

/* Anything shaped like a way to reach a person. Someone does occasionally
   paste an order confirmation into a search box. */
const PERSONAL = /[^\s@]+@[^\s@]+|\+?\d[\d\s().-]{7,}/g;

/**
 * A search term reduced to something we are willing to keep.
 *
 * Search terms are the most useful thing on this list — they say what people
 * came wanting and whether the catalogue has it — and the one most likely to
 * contain something personal by accident. So: contact details removed, case
 * and spacing flattened so "Lego Set" and "lego  set" are one row, and a hard
 * length limit, because a 300-character paste is not a search term.
 */
export function searchTerm(raw: string): string {
  return String(raw || "")
    .replace(PERSONAL, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/**
 * What kind of page this is, in the words src/pageViews.js already uses.
 *
 * Deliberately the same vocabulary as `pageKind` there, so a GA4 report and
 * the admin overview can be read side by side instead of needing a glossary.
 * It is a second implementation rather than a shared one because that one runs
 * on the server against a stored path and this one runs in the browser against
 * `location`; if the names there change, change them here too.
 */
export function pageType(pathname: string): string {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  const rest = parts.length && /^[a-z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
  if (!rest.length) return "home";
  switch (rest[0]) {
    case "deal":
      return "product";
    case "category":
    case "categories":
      return "category";
    case "search":
      return "search";
    case "live":
      return "live";
    case "guides":
      return "guide";
    case "daily-drop":
      return "daily_drop";
    default:
      return rest[0].slice(0, 40);
  }
}
