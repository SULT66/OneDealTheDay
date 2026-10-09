import type { DealFilter, DealLike, SortKey } from "./types";
import { SORT_KEYS } from "./types";
import { discountPercent } from "./format";

/**
 * Filtering and sorting, kept free of any data source.
 *
 * Two callers share this: `lib/catalog.ts` runs it on the server over the full
 * records, and Delia runs it in the browser over a slim index. Because it is
 * the same code, a spoken query and a URL query cannot drift apart.
 */

export function sortDeals<T extends DealLike>(
  list: T[],
  sort: SortKey = "score",
): T[] {
  const sorted = [...list];
  switch (sort) {
    /* rank is the position the search returned, so this restores that order
       after the filter panel has removed things from the middle of it. */
    case "relevance":
      return sorted.sort((a, b) => a.rank - b.rank);
    case "price-asc":
      return sorted.sort((a, b) => a.price - b.price);
    case "price-desc":
      return sorted.sort((a, b) => b.price - a.price);
    case "rating":
      return sorted.sort(
        (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
      );
    case "discount":
      return sorted.sort(
        (a, b) =>
          (discountPercent(b.price, b.referencePrice) ?? -1) -
          (discountPercent(a.price, a.referencePrice) ?? -1),
      );
    case "score":
    default:
      return sorted.sort(
        (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.rank - b.rank,
      );
  }
}

export function applyFilter<T extends DealLike>(
  list: T[],
  filter: DealFilter = {},
): T[] {
  const {
    category,
    retailer,
    maxPrice,
    minPrice,
    minRating,
    minScore,
    discountedOnly,
    query,
    sort,
  } = filter;

  const needle = query?.trim().toLowerCase();

  const matched = list.filter((d) => {
    if (category && d.category !== category) return false;
    if (retailer && d.retailer !== retailer) return false;
    if (maxPrice !== undefined && d.price > maxPrice) return false;
    if (minPrice !== undefined && d.price < minPrice) return false;
    if (minRating !== undefined && d.rating < minRating) return false;
    if (minScore !== undefined && (d.score ?? 0) < minScore) return false;
    if (discountedOnly && discountPercent(d.price, d.referencePrice) === null) {
      return false;
    }
    if (needle) {
      const hay =
        `${d.title} ${d.brand ?? ""} ${d.category} ${d.retailer}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return sortDeals(matched, sort);
}

/* ---------- URL <-> filter, shared by the category page and Delia ---------- */

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function isSortKey(value: string | undefined): value is SortKey {
  return !!value && (SORT_KEYS as readonly string[]).includes(value);
}

export function filterFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): DealFilter {
  const one = (key: string): string | undefined => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const sort = one("sort");

  return {
    retailer: one("retailer") || undefined,
    maxPrice: toNumber(one("max")),
    minPrice: toNumber(one("min")),
    minRating: toNumber(one("rating")),
    minScore: toNumber(one("score")),
    discountedOnly: one("deal") === "1",
    query: one("q") || undefined,
    sort: isSortKey(sort) ? sort : undefined,
  };
}

/** Inverse of the above — Delia uses it to hand off into a category page. */
export function searchParamsFromFilter(filter: DealFilter): string {
  const params = new URLSearchParams();
  if (filter.retailer) params.set("retailer", filter.retailer);
  if (filter.maxPrice !== undefined) params.set("max", String(filter.maxPrice));
  if (filter.minPrice !== undefined) params.set("min", String(filter.minPrice));
  if (filter.minRating !== undefined)
    params.set("rating", String(filter.minRating));
  if (filter.minScore !== undefined) params.set("score", String(filter.minScore));
  if (filter.discountedOnly) params.set("deal", "1");
  if (filter.query) params.set("q", filter.query);
  if (filter.sort) params.set("sort", filter.sort);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Same matched products as the grid, before applying each facet's own restriction. */
export function listingFacets<T extends DealLike>(deals: T[], filter: DealFilter) {
  const retailers = [...new Set(applyFilter(deals, { minPrice: filter.minPrice, maxPrice: filter.maxPrice }).map(d => d.retailer))].sort();
  const prices = applyFilter(deals, { retailer: filter.retailer }).map(d => d.price).filter(p => p > 0 && Number.isFinite(p)).sort((a,b) => a-b);
  const min = prices.length ? Math.floor(prices[0]) : 0;
  // The upper stop is open ended; exceptional prices remain reachable in the numeric fields.
  const upper = prices.length ? prices[Math.min(prices.length-1, Math.floor((prices.length-1)*0.8))] : 0;
  return { retailers, price: { min, max: Math.max(min+1, Math.ceil(upper/10)*10) } };
}

/* ------------------------------ what each choice would actually leave ----- */

/*
 * Every option says how many listings it leaves.
 *
 * Three of the five filters here hide most of the catalogue for a reason that
 * has nothing to do with quality. Measured on the live market: 15% of listings
 * carry a product rating at all, 8% carry a published Score, and 31% have a
 * reference price to be below. So "4★ and up" is, in practice, "and sold by
 * one of the shops that publishes reviews" — it removes 86% of the shelf, and
 * nothing on screen said so until you pressed it.
 *
 * A number beside each option fixes that without arguing about it, and it is
 * the same rule the search box already keeps: never offer a choice that leads
 * nowhere.
 *
 * Counted the way facets are counted everywhere: a dimension's own value is
 * left out of the filter while its options are counted, so the rating options
 * answer "how many, given everything else you have chosen" rather than "how
 * many in the whole market".
 */

/** A catalogue small enough to read is not one worth filtering by price. */
export const PRICE_FILTER_MIN_LISTINGS = 40;

export type OptionCount<V> = { value: V; count: number };
export type PriceBucket = { min: number; max?: number; count: number };

const RATING_VALUES: Array<number | undefined> = [undefined, 4, 4.5];
const SCORE_VALUES: Array<number | undefined> = [undefined, 1, 85];

/** 25 → 25, 240 → 250, 1,730 → 2,000: a number somebody would have typed. */
function friendly(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return Math.round(candidate);
  }
  return Math.round(10 * magnitude);
}

/**
 * Price bands drawn from this shelf rather than from a constant.
 *
 * Mattresses and phone cases do not share a sensible set of thresholds, so the
 * bands come from the quartiles of whatever is in scope, rounded to numbers a
 * person would have typed themselves.
 */
export function priceBuckets<T extends DealLike>(deals: T[]): PriceBucket[] {
  const prices = deals.map((d) => d.price).filter((p) => p > 0 && Number.isFinite(p)).sort((a, b) => a - b);
  if (prices.length < PRICE_FILTER_MIN_LISTINGS) return [];
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * q))];
  /* An edge above the dearest thing on the shelf would make a top band with
     nothing in it, and dropping that band afterwards would leave the panel
     with a closed top — a price filter that cannot say "and up". */
  const dearest = prices[prices.length - 1];
  const edges = [...new Set([friendly(at(0.25)), friendly(at(0.5)), friendly(at(0.75))])]
    .filter((edge) => edge > 0 && edge < dearest)
    .sort((a, b) => a - b);
  if (!edges.length) return [];
  const bounds = [0, ...edges];
  return bounds.map((min, index) => {
    const max = bounds[index + 1];
    const count = prices.filter((price) => price >= min && (max === undefined || price < max)).length;
    return max === undefined ? { min, count } : { min, max, count };
  }).filter((bucket) => bucket.count > 0);
}

/** Every option on the panel, with the number it would leave behind. */
export function listingCounts<T extends DealLike>(deals: T[], filter: DealFilter = {}) {
  const size = (patch: Partial<DealFilter>) =>
    applyFilter(deals, { ...filter, ...patch }).length;
  const withoutPrice = { minPrice: undefined, maxPrice: undefined };
  const inPriceScope = applyFilter(deals, { ...filter, ...withoutPrice });

  return {
    total: applyFilter(deals, filter).length,
    retailers: [...new Set(applyFilter(deals, { ...filter, retailer: undefined }).map((d) => d.retailer))]
      .sort()
      .map((value) => ({ value, count: size({ retailer: value }) })),
    rating: RATING_VALUES.map((value) => ({ value, count: size({ minRating: value }) })),
    score: SCORE_VALUES.map((value) => ({ value, count: size({ minScore: value }) })),
    discounted: size({ discountedOnly: true }),
    price: {
      buckets: priceBuckets(inPriceScope).map((bucket) => ({
        ...bucket,
        count: size({ minPrice: bucket.min || undefined, maxPrice: bucket.max }),
      })),
      listings: inPriceScope.length,
    },
  };
}
