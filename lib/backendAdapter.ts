import type { Deal, PricePoint } from "./types";

/**
 * Maps the OneDealTheDay backend's product shape (see `presentProduct()` in
 * the backend repo) onto this site's `Deal` type. The backend has no gallery,
 * no bullet strengths/watch-outs and doesn't always publish a score — those
 * fields degrade to an empty array / null rather than being invented.
 */

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
export function adaptProduct(raw: RawProduct): Omit<Deal, "rank"> {
  const image = raw.image_url || "";
  const reason = raw.display_selection_reason || raw.selection_reason;

  return {
    id: String(raw.id),
    title: raw.title,
    brand: raw.brand || null,
    category: slugifyCategory(raw.public_category),
    retailer: raw.retailer_name || raw.source,
    image,
    images: image ? [image] : [],
    price: raw.current_price,
    referencePrice:
      raw.original_price && raw.original_price > raw.current_price
        ? raw.original_price
        : null,
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
