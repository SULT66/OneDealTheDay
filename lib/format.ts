/**
 * Formatting helpers.
 *
 * Timezone is pinned to UTC on purpose: these values are rendered on the
 * server and hydrated on the client, and letting the machine's own timezone
 * decide produces hydration mismatches. Locale follows the market (a market
 * code is deterministic — both server and client agree on it from the URL —
 * so it doesn't have the same hydration risk that the visitor's own locale
 * would).
 */

const MARKET_LOCALES: Record<string, string> = {
  us: "en-US",
  ca: "en-CA",
  uk: "en-GB",
  fr: "fr-FR",
  de: "de-DE",
};

export function localeForMarket(market?: string): string {
  return (market && MARKET_LOCALES[market]) || "en-US";
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function currencyFormatter(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, f);
  }
  return f;
}

export function formatPrice(value: number, currency = "USD", market?: string): string {
  return currencyFormatter(currency, localeForMarket(market)).format(value);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(locale: string): Intl.DateTimeFormat {
  let f = dateFormatters.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    dateFormatters.set(locale, f);
  }
  return f;
}

function dateTimeFormatter(locale: string): Intl.DateTimeFormat {
  let f = dateTimeFormatters.get(locale);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
    dateTimeFormatters.set(locale, f);
  }
  return f;
}

export function formatDate(iso: string, market?: string): string {
  return dateFormatter(localeForMarket(market)).format(new Date(iso));
}

export function formatDateTime(iso: string, market?: string): string {
  return `${dateTimeFormatter(localeForMarket(market)).format(new Date(iso))} UTC`;
}

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatCount(value: number): string {
  return numberFormatter.format(value);
}

/**
 * Whole-percent saving against the reference price.
 * Returns null when there is no verified reference to compare against, which
 * is the honest answer — the site never invents a discount.
 */
export function discountPercent(
  price: number,
  referencePrice: number | null,
): number | null {
  if (referencePrice === null || referencePrice <= price) return null;
  return Math.round(((referencePrice - price) / referencePrice) * 100);
}

const RETAILER_LABELS: Record<string, string> = {
  ebay: "eBay",
  amazon: "Amazon",
  bestbuy: "Best Buy",
  target: "Target",
  wayfair: "Wayfair",
  walmart: "Walmart",
  "home-depot": "Home Depot",
  lowes: "Lowe's",
  aliexpress: "AliExpress",
  tribesigns: "Tribesigns",
  mooncool: "Mooncool",
  giftlab: "Giftlab",
  "king-koil": "King Koil",
  currys: "Currys",
  ao: "AO.com",
  fnac: "Fnac",
  cdiscount: "Cdiscount",
  darty: "Darty",
  mediamarkt: "MediaMarkt",
  saturn: "Saturn",
  otto: "OTTO",
  alternate: "ALTERNATE",
  samsung: "Samsung",
};

/**
 * The backend adds real retailers (Awin feeds, native adapters) over time, so
 * this can't be an exhaustive switch — known slugs get their real brand name,
 * anything else is humanized from its raw form (e.g. "feed-mooncool" -> "Feed
 * Mooncool") rather than shown as a raw slug.
 */
export function retailerLabel(retailer: string): string {
  const key = retailer.trim().toLowerCase();
  if (RETAILER_LABELS[key]) return RETAILER_LABELS[key];
  return retailer
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/** "99.9% positive" reads better than a bare number next to a seller handle. */
export function formatPositive(pct: number): string {
  return `${pct.toFixed(1)}% positive`;
}
