import type { Deal, PricePoint } from "./types";

/**
 * Maps the OneDealTheDay backend's product shape (see `presentProduct()` in
 * the backend repo) onto this site's `Deal` type. The backend has no gallery,
 * no bullet strengths/watch-outs and doesn't always publish a score — those
 * fields degrade to an empty array / null rather than being invented.
 */

/**
 * Misspellings a merchant sent us, corrected on the way to the page.
 *
 * "Persoanlized Picture Car Air Fresheners" is the seller's own typo, and on
 * their listing that is their problem. On OneDailyDrop it reads as ours, and a
 * partner reviewing the site said exactly that.
 *
 * Every entry has been seen in the live feed and counted: five listings say
 * Persoanlized, one says Protecter. Nothing is here on suspicion, because a
 * guess would eventually "correct" a real product name. Klein Tools really
 * does write ImpactRated, and that stays.
 *
 * Whole words only, and the original capitalisation is kept, so PERSOANLIZED
 * in a shouty title stays shouty.
 */
const FEED_TITLE_TYPOS: Record<string, string> = {
  persoanlized: "personalized",
  protecter: "protector",
};

const matchCase = (source: string, corrected: string) => {
  if (source === source.toUpperCase()) return corrected.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return corrected[0].toUpperCase() + corrected.slice(1);
  }
  return corrected;
};

export function correctFeedTitle(title: string): string {
  return String(title || "").replace(/[a-zA-Z]+/g, (word) => {
    const corrected = FEED_TITLE_TYPOS[word.toLowerCase()];
    return corrected ? matchCase(word, corrected) : word;
  });
}

export type RawProduct = {
  id: number | string;
  title: string;
  brand: string | null;
  public_category: string;
  retailer_name: string | null;
  source: string;
  image_url: string | null;
  current_price: number;
  original_price: number | null;
  currency: string;
  display_score: number | null;
  rating: number | null;
  review_count: number | null;
  seller_name: string | null;
  seller_rating: number | null;
  seller_feedback_count: number | null;
  display_seller_rating: string | null;
  display_shipping_summary: string | null;
  shipping_summary: string | null;
  display_return_summary: string | null;
  return_summary: string | null;
  display_availability: string | null;
  display_shop_all?: boolean;
  display_price_is_current?: boolean;
  availability: string | null;
  selection_reason: string | null;
  display_selection_reason: string | null;
  daily_rank: number | null;
  checked_at: string;
};

/** "Tools & DIY" -> "tools-diy" — matches the slugs in data/categories.json. */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sellerPositivePct(raw: RawProduct): number {
  const parsed = raw.display_seller_rating
    ? parseFloat(raw.display_seller_rating)
    : NaN;
  if (Number.isFinite(parsed)) return parsed;
  const rating = raw.seller_rating ?? 0;
  return rating <= 5 ? rating * 20 : rating;
}

/**
 * `rank` is not filled in here — the backend only assigns a real rank to the
 * daily top 10, so the caller synthesizes it from list position once the full
 * market catalog is fetched (see `fetchMarketCatalog` in lib/catalog.ts).
 */
/**
 * "Unbranded", "Generic", "Branded", "Unknown" and friends are what a
 * marketplace writes into the brand column when the seller left it blank. They
 * are not brands: printing "Brand: Branded" on a product page reads as a bug,
 * and the SEO brand page built from one is a thin programmatic page. Treated as
 * no brand at all, everywhere.
 */
const PLACEHOLDER_BRAND = /^(?:unbranded(?:[ -]generic)?|generic|branded|unknown|no ?brand|n\/?a|does not apply)$/i;

function realBrand(value: string | null | undefined): string | null {
  const brand = String(value ?? "").trim();
  return brand && !PLACEHOLDER_BRAND.test(brand) ? brand : null;
}

export function adaptProduct(raw: RawProduct): Omit<Deal, "rank"> {
  const image = raw.image_url || "";
  const reason = raw.display_selection_reason || raw.selection_reason;

  return {
    id: String(raw.id),
    title: correctFeedTitle(raw.title),
    brand: realBrand(raw.brand),
    category: slugifyCategory(raw.public_category),
    retailer: raw.retailer_name || raw.source,
    image,
    images: image ? [image] : [],
    price: raw.current_price,
    /*
     * No reference price once the current price is out of date, and that is
     * deliberately the only place this decision is made.
     *
     * Every discount on the site — the card badge, the pill beside the price,
     * the "discounted only" filter, the sort by biggest saving — is
     * discountPercent(price, referencePrice). Withholding the reference turns
     * all of them off at once, which is the only way to be sure none of them
     * is left quietly claiming a saving worked out from a price nobody has
     * confirmed since Tuesday.
     */
    referencePrice:
      raw.display_price_is_current === false
        ? null
        : raw.original_price && raw.original_price > raw.current_price
          ? raw.original_price
          : null,
    priceIsCurrent: raw.display_price_is_current !== false,
    currency: raw.currency,
    score: raw.display_score,
    rating: raw.rating ?? 0,
    reviewCount: raw.review_count ?? 0,
    seller: {
      name: raw.seller_name || "",
      positivePct: sellerPositivePct(raw),
      ratingsCount: raw.seller_feedback_count ?? 0,
    },
    delivery: raw.display_shipping_summary || raw.shipping_summary || "",
    returns: raw.display_return_summary || raw.return_summary || "",
    availability: raw.display_availability || raw.availability || "",
    shopAll: Boolean(raw.display_shop_all),
    whyWePicked: reason ? [reason] : [],
    strengths: [],
    watchOuts: [],
    priceHistory: [],
    lows: { d30: 0, d90: 0, allTime: 0 },
    checkedAt: raw.checked_at,
  };
}

export type RawPriceHistoryResponse = {
  summary: {
    lowest_30_days: number | null;
    lowest_90_days: number | null;
    lowest_ever: number | null;
  };
  history: Array<{
    price: number;
    observed_at?: string;
    our_observed_at?: string;
    source_updated_at?: string;
  }>;
};

export function adaptPriceHistory(raw: RawPriceHistoryResponse): {
  priceHistory: PricePoint[];
  lows: Deal["lows"];
} {
  const priceHistory: PricePoint[] = raw.history
    .map((row) => {
      const iso = row.observed_at || row.our_observed_at || row.source_updated_at;
      if (!iso) return null;
      return { date: iso.slice(0, 10), price: row.price };
    })
    .filter((row): row is PricePoint => row !== null);

  return {
    priceHistory,
    lows: {
      d30: raw.summary.lowest_30_days ?? 0,
      d90: raw.summary.lowest_90_days ?? 0,
      allTime: raw.summary.lowest_ever ?? 0,
    },
  };
}
