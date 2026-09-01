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
 * One fetch per (market, limit, category) — every list-shaped query (today's
 * drop, more picks, category/search filtering, related picks, price bounds,
 * active retailers, category counts) used to read one full-catalog array,
 * exactly like the old local `deals` array did. Header, Footer and a page
 * body each called one of these independently, so without memoization a
 * single page view triggered it five-plus times — and the catalog itself is
 * multiple megabytes for a busy market (US, ~2,600 products, ~3.5MB compact),
 * dominated by one oversized feed (Gifts, ~2,300 of those), so every one of
 * those five-plus calls was a multi-megabyte fetch + parse + map from
 * scratch. `cache()` from `react` fixes the *repeat-call* half of that: it
 * memoizes this function per argument tuple for the lifetime of one request.
 *
 * The other half is `limit`/`category`, both handled server-side now (see
 * app.js's /api/products) — callers that only need one category (a category
 * page) or a bounded sample (the homepage's top picks) ask for exactly that
 * instead of the whole market. Bounded calls are safely under Next's 2MB
 * data-cache limit, so those also get real cross-request caching
 * (`next.revalidate`); an unbounded call (no limit, no category — still used
 * where correctness needs the true full catalog, e.g. price bounds) keeps
 * `cache: "no-store"` since it can be too large for that cache to hold.
 *
 * `rank` isn't trusted from the backend (it only assigns one to the daily
 * top 10) — it's synthesized from list position instead, since the backend
 * already returns daily-drop items first, followed by the rest of the
 * catalog sorted by score.
 */
const fetchMarketCatalog = cache(
  async (marketCode: string, limit?: number, category?: string): Promise<Deal[]> => {
    const params = new URLSearchParams({ market: marketCode, compact: "1" });
    if (limit) params.set("limit", String(limit));
    if (category) params.set("category", category);
    const bounded = Boolean(limit || category);

    const res = await fetch(`${BACKEND_URL}/api/products?${params}`, {
      ...(bounded ? { next: { revalidate: 300 } } : { cache: "no-store" as const }),
    });
    if (!res.ok) {
      throw new Error(`Failed to load the catalog for "${marketCode}" (${res.status}).`);
    }
    const raw = (await res.json()) as RawProduct[];
    return raw.map((product, index) => ({
      ...adaptProduct(product),
      rank: index + 1,
    }));
  },
);

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
 * Reads /api/categories — one `GROUP BY` on the backend — rather than
 * fetching the whole market catalog just to count it. Header and Footer both
 * call this on every single page, so this was previously the single biggest
 * source of "switching tabs feels slow": a multi-megabyte fetch on every
 * navigation just to print a dozen numbers.
 *
 * `language` translates the display name. categories.json carries the English
 * name only — that is display configuration, not copy — while src/i18n.js has
 * had every category in four languages since the Express pages. Nothing here
 * used it, so the navigation stayed in English on every translated page and
 * switching language looked like it did nothing at all.
 */
/**
 * The backend's own count per category, and the only place any page counts
 * the catalogue.
 *
 * There used to be two answers. The category tiles totalled 2,631 from here,
 * while About and For retailers said 2,548 because they measured the length of
 * /api/products, which lists fewer items than the catalogue holds. A reviewer
 * put the three numbers side by side and asked which one was true.
 */
async function fetchCategoryCounts(
  marketCode: string,
): Promise<Array<{ category: string; count: number }>> {
  const res = await fetch(
    `${BACKEND_URL}/api/categories?market=${encodeURIComponent(marketCode)}`,
    { next: { revalidate: 300 } },
  );
  if (!res.ok) {
    throw new Error(`Failed to load category counts for "${marketCode}" (${res.status}).`);
  }
  return (await res.json()) as Array<{ category: string; count: number }>;
}

export async function getCategoriesWithCounts(
  marketCode: string,
  language?: string,
): Promise<Array<Category & { count: number }>> {
  const rows = await fetchCategoryCounts(marketCode);

  return rows
    .map(({ category, count }) => {
      const slug = slugifyCategory(category);
      const known = getCategory(slug);
      const named = known
        ? { ...known, count }
        : { slug, name: category, ...FALLBACK_CATEGORY, count };
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
  /* The backend already returns its best-scoring items first, so picking
     from the top 300 finds the same diverse shortlist a full 2,600-item
     market would — every category here has well under 300 listings except
     Gifts, which the caps below only ever take perCategory of anyway. */
  const deals = await fetchMarketCatalog(marketCode, 300);
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
  /*
   * Best first, because the section calls itself "Best right now".
   *
   * The caps above pick a spread across categories and shops, which is what
   * makes the grid worth reading, but they walk the catalogue in its own order
   * and the result came out 88, 88, 90, 90, 89, 89. A section promising the
   * highest scoring that lists a 90 below an 88 reads as a broken ranking, and
   * a reviewer read it exactly that way.
   *
   * Only the order changes; the same items are chosen. An item the backend has
   * not scored sorts last rather than counting as a zero.
   */
  return picked.sort((left, right) => (right.score ?? -1) - (left.score ?? -1));
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
 *
 * When the filter names a category, that's scoped server-side too — a
 * category page only ever needed its own slice, not the market's full
 * catalog. The rest of the filter (retailer, price, rating, score, sort)
 * still runs client-side over that (already much smaller) slice via
 * `applyFilter`. The search page passes no category, so it still reads the
 * full catalog — free-text search across everything doesn't have a
 * server-side query to scope it to yet.
 */
export async function getDeals(marketCode: string, filter: DealFilter = {}): Promise<Deal[]> {
  const backendCategory = filter.category ? getCategory(filter.category)?.name : undefined;
  const deals = await fetchMarketCatalog(
    marketCode,
    backendCategory ? 500 : undefined,
    backendCategory,
  );
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
/**
 * How many listings this market holds, counted once.
 *
 * Read from the same per-category figures the category tiles show, so the
 * number on About, the number on For retailers and the tiles a visitor can
 * add up all agree. It used to be the length of the /api/products response,
 * which lists fewer items than the catalogue holds: 2,548 against 2,631, and
 * a partner reviewing the site found all three numbers and trusted none.
 */
export async function getCatalogSize(marketCode: string): Promise<number> {
  const rows = await fetchCategoryCounts(marketCode);
  return rows.reduce((total, row) => total + (Number(row.count) || 0), 0);
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
  picks: Array<Deal & {
    selectedPrice: number | null;
    status: string;
    /** False once the product has been archived: its /deal/ and /go/ routes
        both 404, so the card must be rendered without a link. */
    available: boolean;
  }>;
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
      available?: boolean;
    }>;
  }>;
  /* A pick is only linkable if the deal page can actually find it, and that
     page reads the same catalog this call returns. Two separate things drop a
     product out of it: being archived (checked server-side), and being merged
     away as a duplicate offer — five identical "No Pull Dog Pet Harness"
     listings collapse to one, and the archive was linking the four that lost.
     Cross-checking against the catalog covers both without guessing at the
     rules. `fetchMarketCatalog` is memoized per request, so this is free: the
     header on the same page has already fetched it. */
  const catalogIds = new Set((await fetchMarketCatalog(marketCode)).map((d) => d.id));

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
      available: pick.available !== false && catalogIds.has(String(pick.id)),
    })),
  }));
}
