import { cache } from "react";
import categoriesData from "@/site-content/categories.json";
import marketsData from "@/site-content/markets.json";
import type { Category, Deal, DealFilter, Market } from "./types";
import { applyFilter, sortDeals } from "./filter";
import { categoryName } from "./i18n";
import {
  adaptPriceHistory,
  adaptProduct,
  slugifyCategory,
  type RawPriceHistoryResponse,
  type RawProduct,
} from "./backendAdapter";

/**
 * The single door to catalog data.
 *
 * Pages and components never fetch the backend directly — everything goes
 * through here, backed by the live OneDealTheDay API instead of a local
 * demo file. `site-content/categories.json` and `site-content/markets.json`
 * stay local: they are display config (icon, blurb, currency, locale) the
 * backend doesn't publish, not catalog data.
 */

const categories = categoriesData as Category[];
const markets = marketsData as Market[];

const FALLBACK_CATEGORY: Omit<Category, "slug" | "name"> = {
  noun: "pick",
  nounPlural: "picks",
  icon: "Package",
  blurb: "Checked picks in this category.",
};

/**
 * The API this now calls is served by the very same Express process (see
 * the bottom of src/server.js), so this defaults to a loopback call rather
 * than the public domain — no DNS/TLS round trip for a request that never
 * leaves the machine.
 */
export const BACKEND_URL =
  process.env.BACKEND_API_URL || `http://127.0.0.1:${process.env.PORT || 8088}`;

/**
 * One fetch per market — every list-shaped query (today's drop, more picks,
 * category/search filtering, related picks, price bounds, active retailers,
 * category counts) reads this same array, exactly like the old local
 * `deals` array did. Header, Footer and a page body each call one of these
 * independently, so without memoization a single page view can trigger it
 * five-plus times.
 *
 * `rank` isn't trusted from the backend (it only assigns one to the daily
 * top 10) — it's synthesized from list position instead, since the backend
 * already returns daily-drop items first, followed by the rest of the
 * catalog sorted by score.
 *
 * Uses `compact=1` (has every field the adapter reads) and `cache: "no-store"`
 * on the raw fetch: the full catalog is multiple megabytes for a busy
 * market — well over Next's 2MB data-cache entry limit, so that cache is a
 * non-starter here. `cache()` from `react` is the fix instead: it memoizes
 * the whole function (fetch + JSON parse + the adaptProduct/rank mapping
 * below) per market code for the lifetime of one request, so the work
 * genuinely runs once no matter how many places on the page ask for it —
 * this is what was missing before, and is the main reason a market with a
 * large catalog (US, ~2,600 products, ~3.5MB compact) rendered noticeably
 * slower than a small one (France, ~120KB): every caller was redoing the
 * same multi-megabyte parse and 2,600-item map from scratch.
 */
const fetchMarketCatalog = cache(async (marketCode: string): Promise<Deal[]> => {
  const res = await fetch(
    `${BACKEND_URL}/api/products?market=${encodeURIComponent(marketCode)}&compact=1`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Failed to load the catalog for "${marketCode}" (${res.status}).`);
  }
  const raw = (await res.json()) as RawProduct[];
  return raw.map((product, index) => ({
    ...adaptProduct(product),
    rank: index + 1,
  }));
});

export function getMarkets(): Market[] {
  return markets;
}

export function getMarket(code: string): Market | undefined {
  return markets.find((m) => m.code === code);
}

export function getCategories(): Category[] {
  return categories;
}

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

/**
 * Live category slugs + counts, with local display metadata layered on.
 *
 * `language` translates the display name. categories.json carries the English
 * name only — that is display configuration, not copy — while src/i18n.js has
 * had every category in four languages since the Express pages. Nothing here
 * used it, so the navigation stayed in English on every translated page and
 * switching language looked like it did nothing at all.
 */
export async function getCategoriesWithCounts(
  marketCode: string,
  language?: string,
): Promise<Array<Category & { count: number }>> {
  const deals = await fetchMarketCatalog(marketCode);
  const counts = new Map<string, number>();
  for (const d of deals) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);

  return [...counts.entries()]
    .map(([slug, count]) => {
      const known = getCategory(slug);
      const named = known
        ? { ...known, count }
        : { slug, name: slug, ...FALLBACK_CATEGORY, count };
      return language ? { ...named, name: categoryName(named.name, language) } : named;
    })
    .sort((a, b) => b.count - a.count);
}

export async function getDeal(marketCode: string, id: string): Promise<Deal | undefined> {
  const deals = await fetchMarketCatalog(marketCode);
  const deal = deals.find((d) => d.id === id);
  if (!deal) return undefined;

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/products/${encodeURIComponent(id)}/price-history`,
      { next: { revalidate: 900 } },
    );
    if (res.ok) {
      const raw = (await res.json()) as RawPriceHistoryResponse;
      const { priceHistory, lows } = adaptPriceHistory(raw);
      return { ...deal, priceHistory, lows };
    }
  } catch {
    // Price history is a nice-to-have on the detail page — the deal itself
    // still renders without it.
  }
  return deal;
}

/** Rank 1 — the single pick the whole site is built around. */
export async function getTodaysDrop(marketCode: string): Promise<Deal> {
  const deals = await fetchMarketCatalog(marketCode);
  return deals[0];
}

/**
 * The homepage shortlist.
 *
 * The homepage no longer leads with the daily drop, so it needs its own list:
 * the best-scoring offers in the market, capped so a single category or
 * retailer cannot fill the whole grid. Without the caps the grid fills with
 * whatever the largest feed happens to score well on — twelve desk gadgets
 * from one source is a worse homepage than eight varied ones.
 *
 * These caps are a front-end stopgap. Diversity belongs in the backend ranker
 * next to the daily selection; this keeps the page honest until it lives there.
 * A thin catalog can starve the caps, and a short grid is the right answer —
 * it is never padded back out with the items the caps just rejected.
 */
export async function getTopPicks(
  marketCode: string,
  limit = 12,
  { perCategory = 3, perRetailer = 4 }: { perCategory?: number; perRetailer?: number } = {},
): Promise<Deal[]> {
  const deals = await fetchMarketCatalog(marketCode);
  const picked: Deal[] = [];
  const categoryCount = new Map<string, number>();
  const retailerCount = new Map<string, number>();

  for (const deal of deals) {
    if (picked.length >= limit) break;
    if ((categoryCount.get(deal.category) ?? 0) >= perCategory) continue;
    if ((retailerCount.get(deal.retailer) ?? 0) >= perRetailer) continue;
    picked.push(deal);
    categoryCount.set(deal.category, (categoryCount.get(deal.category) ?? 0) + 1);
    retailerCount.set(deal.retailer, (retailerCount.get(deal.retailer) ?? 0) + 1);
  }
  return picked;
}

/** Everything except today's drop, in rank order. */
export async function getMorePicks(marketCode: string, limit?: number): Promise<Deal[]> {
  const deals = await fetchMarketCatalog(marketCode);
  const rest = deals.slice(1);
  return limit ? rest.slice(0, limit) : rest;
}

/**
 * The one query function. The category page calls it with filters parsed from
 * the URL.
 */
export async function getDeals(marketCode: string, filter: DealFilter = {}): Promise<Deal[]> {
  const deals = await fetchMarketCatalog(marketCode);
  return applyFilter(deals, filter);
}

/** Same category first, then anything else with a strong score. */
export async function getRelated(marketCode: string, deal: Deal, limit = 4): Promise<Deal[]> {
  const deals = await fetchMarketCatalog(marketCode);
  const sameCategory = deals.filter((d) => d.id !== deal.id && d.category === deal.category);
  const rest = deals.filter((d) => d.id !== deal.id && d.category !== deal.category);
  return [...sortDeals(sameCategory), ...sortDeals(rest)].slice(0, limit);
}

/**
 * Range for the maximum-price slider.
 *
 * Both ends snap to multiples of the slider's $5 step so that a value arriving
 * from the URL — say `?max=400` — lands exactly on a stop.
 */
export async function getPriceBounds(marketCode: string): Promise<{ min: number; max: number }> {
  const deals = await fetchMarketCatalog(marketCode);
  const highest = deals.length ? Math.max(...deals.map((d) => d.price)) : 100;
  return { min: 5, max: Math.ceil(highest / 50) * 50 };
}

/** Retailers present in the catalog, so the filter never offers an empty option. */
export async function getActiveRetailers(marketCode: string): Promise<string[]> {
  const deals = await fetchMarketCatalog(marketCode);
  return [...new Set(deals.map((d) => d.retailer))].sort();
}

/** Total checked listings for a market — used by the About page's copy. */
export async function getCatalogSize(marketCode: string): Promise<number> {
  const deals = await fetchMarketCatalog(marketCode);
  return deals.length;
}

export { slugifyCategory };

/* URL <-> filter translation lives in lib/filter.ts so that it stays free of
   any data source. */
export { filterFromSearchParams, searchParamsFromFilter } from "./filter";

/**
 * Past drops, newest day first.
 *
 * Read from /api/archive rather than the catalog: a past drop is a record of a
 * decision on a date, and the catalog only knows what is true right now. Each
 * pick carries the price it was chosen at as well as today's price, so a day
 * whose deal has since expired reads as history rather than as a live offer.
 */
export type ArchiveDay = {
  date: string;
  picks: Array<Deal & { selectedPrice: number | null; status: string }>;
};

export async function getArchive(marketCode: string, days = 30): Promise<ArchiveDay[]> {
  const res = await fetch(
    `${BACKEND_URL}/api/archive?market=${encodeURIComponent(marketCode)}&days=${days}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Failed to load past drops for "${marketCode}" (${res.status}).`);
  }
  const raw = (await res.json()) as Array<{
    date: string;
    picks: Array<RawProduct & {
      drop_price?: number | null;
      availability_status?: string | null;
      daily_rank?: number | null;
    }>;
  }>;
  return raw.map((day) => ({
    date: day.date,
    picks: day.picks.map((pick, index) => ({
      ...adaptProduct(pick),
      rank: pick.daily_rank ?? index + 1,
      selectedPrice:
        pick.drop_price != null && pick.drop_price !== pick.current_price
          ? pick.drop_price
          : null,
      status: pick.availability_status || "",
    })),
  }));
}
