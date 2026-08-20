import categoriesData from "@/site-content/categories.json";
import marketsData from "@/site-content/markets.json";
import type { Category, Deal, DealFilter, Market } from "./types";
import { applyFilter, sortDeals } from "./filter";
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
 * One fetch per market, cached for 5 minutes — every list-shaped query
 * (today's drop, more picks, category/search filtering, related picks,
 * price bounds, active retailers, category counts) reads this same array,
 * exactly like the old local `deals` array did.
 *
 * `rank` isn't trusted from the backend (it only assigns one to the daily
 * top 10) — it's synthesized from list position instead, since the backend
 * already returns daily-drop items first, followed by the rest of the
 * catalog sorted by score.
 *
 * Uses `compact=1` (has every field the adapter reads) and no persistent
 * cache: the full catalog is multiple megabytes for a busy market — well
 * over Next's 2MB data-cache entry limit — so this relies on Next's
 * automatic per-request fetch memoization instead (every catalog.ts call
 * within one page render shares this one network request already, since
 * they all resolve the same URL).
 */
async function fetchMarketCatalog(marketCode: string): Promise<Deal[]> {
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
}

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

/** Live category slugs + counts, with local display metadata layered on. */
export async function getCategoriesWithCounts(
  marketCode: string,
): Promise<Array<Category & { count: number }>> {
  const deals = await fetchMarketCatalog(marketCode);
  const counts = new Map<string, number>();
  for (const d of deals) counts.set(d.category, (counts.get(d.category) ?? 0) + 1);

  return [...counts.entries()]
    .map(([slug, count]) => {
      const known = getCategory(slug);
      return known
        ? { ...known, count }
        : { slug, name: slug, ...FALLBACK_CATEGORY, count };
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
