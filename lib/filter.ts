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
