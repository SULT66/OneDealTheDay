import type { Deal } from "./types";
import { discoveryOrder } from "../src/discoveryRanking";

/** Recommendations include current, eligible offers without product reviews.
 * Public Deal Scores keep their own evidence gate and are never manufactured. */
export function chooseTopPicks(deals: Deal[],
  { limit = 12, perCategory = 3, perRetailer = 4 }:
  { limit?: number; perCategory?: number; perRetailer?: number } = {}): Deal[] {
  return discoveryOrder(deals, { limit, perCategory, perRetailer, shelf: true });
}
