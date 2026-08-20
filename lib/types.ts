/**
 * Shape of the data OneDailyDrop actually publishes today.
 *
 * Populated from the live OneDealTheDay backend API (see lib/backendAdapter.ts).
 * Nothing in the UI reads anything that is not declared here, which is what
 * keeps a backend field change a data change rather than a rewrite.
 */

/**
 * Retailer is open-ended — the backend adds real retailers (Awin feeds, native
 * adapters) over time without a code change here, so this is the raw slug the
 * backend reports (e.g. "ebay", "feed-tribesigns") rather than a fixed union.
 */
export type Retailer = string;

export type PricePoint = {
  /** ISO date, YYYY-MM-DD */
  date: string;
  price: number;
};

export type Seller = {
  name: string;
  /** Percentage of positive feedback, 0–100. */
  positivePct: number;
  ratingsCount: number;
};

export type Deal = {
  id: string;
  /** 1 is today's drop; the rest fill "More checked picks". */
  rank: number;
  title: string;
  brand: string | null;
  /** Slug from data/categories.json. */
  category: string;
  retailer: Retailer;
  image: string;
  images: string[];
  price: number;
  /** Retailer's own reference/list price, when one is verified. */
  referencePrice: number | null;
  currency: string;
  /** OneDailyDrop Score, 0–100. Null until a listing clears the editorial gate. */
  score: number | null;
  rating: number;
  reviewCount: number;
  seller: Seller;
  delivery: string;
  returns: string;
  availability: string;
  /** Bullet reasons this listing was selected. */
  whyWePicked: string[];
  strengths: string[];
  watchOuts: string[];
  priceHistory: PricePoint[];
  lows: { d30: number; d90: number; allTime: number };
  /** ISO timestamp of the last price check. */
  checkedAt: string;
};

export type Category = {
  slug: string;
  name: string;
  /**
   * How Delia refers to one item from this category out loud. Stored per
   * category rather than derived, because English plurals of these labels are
   * irregular often enough ("pet supply"/"pet supplies", "furniture deal") that
   * adding an "s" produces nonsense.
   */
  noun: string;
  nounPlural: string;
  /** Phosphor icon name rendered by components/ui/CategoryIcon. */
  icon: string;
  blurb: string;
};

export type Market = {
  code: string;
  country: string;
  currency: string;
  language: string;
};

/**
 * Every filter the catalog understands. The category page keeps these in the
 * URL, and Delia produces the exact same object from speech — so a spoken
 * request and a clicked filter end in identical state.
 */
/**
 * The subset of a Deal that filtering and sorting need — lets lib/filter.ts
 * stay generic over both the full catalog and any slimmer shape.
 */
export type DealLike = {
  id: string;
  rank: number;
  title: string;
  brand: string | null;
  category: string;
  retailer: Retailer;
  price: number;
  referencePrice: number | null;
  currency: string;
  score: number | null;
  rating: number;
  reviewCount: number;
  image: string;
};

export type DealFilter = {
  category?: string;
  retailer?: Retailer;
  maxPrice?: number;
  minPrice?: number;
  minRating?: number;
  minScore?: number;
  /** Only listings priced below a verified reference price. */
  discountedOnly?: boolean;
  /** Free-text match against title, brand and category. */
  query?: string;
  sort?: SortKey;
};

export const SORT_KEYS = [
  "score",
  "price-asc",
  "price-desc",
  "rating",
  "discount",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
