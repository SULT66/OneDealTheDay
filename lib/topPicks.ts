import type { Deal } from "./types";
import { productType } from "../src/productVariety";

/**
 * Which listings the homepage shelf holds.
 *
 * Pure, and in its own file, because the choice is the part worth testing and
 * everything around it in lib/catalog.ts is a network call.
 *
 * The shelf is headed "Best right now", so it may only hold listings we can
 * call best: a published Score means product reviews stand behind the number,
 * and an unscored listing is not a bad one — it is one we have no reviews for,
 * and it belongs on the category pages. The grid is allowed to come back
 * short; padding it with the listings these rules just rejected is how it went
 * wrong the first time, when it filled with 67s under a heading calling them
 * the best on the site.
 */
export function chooseTopPicks(
  deals: Deal[],
  { limit = 12, perCategory = 3, perRetailer = 4 }:
    { limit?: number; perCategory?: number; perRetailer?: number } = {},
): Deal[] {
  /*
   * Choose by the number the shelf prints.
   *
   * It used to walk the catalogue in the backend's ranking order and sort only
   * what it had already taken, so the caps filled up on whatever ranked early
   * and the genuinely highest-scoring listings were never reached. Measured on
   * production on 2026-10-13: the grid showed 86, 85, 85, 85 — three of them
   * the same watch in different colours — while 92, 91, 91, 90 and 90 sat in
   * the same catalogue, unconsidered. A section choosing on a different number
   * than the one printed beside each card is not doing what it says.
   */
  const candidates = deals
    .filter((deal) => deal.score != null)
    .sort((left, right) => (right.score ?? -1) - (left.score ?? -1));

  /*
   * A cap can only spread a grid across shops that are in the running.
   *
   * Only eBay sends product reviews, and without reviews there is no published
   * Score, so every candidate comes from one shop. The per-retailer cap then
   * diversified nothing and simply cut the shelf to four of its twelve places.
   * It applies when there is a second shop to spread across and stands aside
   * when there is not — which is also how it comes back into force by itself
   * the day another source starts sending reviews.
   */
  const shopsInTheRunning = new Set(candidates.map((deal) => deal.retailer)).size;
  const retailerCap = shopsInTheRunning > 1 ? perRetailer : limit;

  const picked: Deal[] = [];
  const usedTypes = new Set<string>();
  const categoryCount = new Map<string, number>();
  const retailerCount = new Map<string, number>();

  for (const deal of candidates) {
    if (picked.length >= limit) break;
    const type = productType(deal);
    if (type && usedTypes.has(type)) continue;
    if ((categoryCount.get(deal.category) ?? 0) >= perCategory) continue;
    if ((retailerCount.get(deal.retailer) ?? 0) >= retailerCap) continue;
    picked.push(deal);
    if (type) usedTypes.add(type);
    categoryCount.set(deal.category, (categoryCount.get(deal.category) ?? 0) + 1);
    retailerCount.set(deal.retailer, (retailerCount.get(deal.retailer) ?? 0) + 1);
  }

  return picked;
}
