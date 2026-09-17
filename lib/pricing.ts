import { discountPercent } from "./format";
import type { PricePoint } from "./types";

/*
 * What a discount may claim.
 *
 * The reference price beside a listing is the seller's own "was" figure. It is
 * often real, and it is sometimes a different configuration, a multipack, or a
 * number typed once and never revisited: a storage cabinet sold at $124 quoted
 * a $939 reference, and the page printed "87% below reference" as though that
 * were a fact we had established. It is not; we published the seller's number
 * as our own.
 *
 * So: a saving is shown as the seller's list price, in those words, and a
 * saving large enough to be extraordinary is only shown at all when something
 * of ours backs it — a price we ourselves recorded near that reference. Where
 * nothing does, the listing keeps its price and loses the badge, which is the
 * honest half of what we knew.
 */

/* Above this, a claim needs more than the seller's word for it. */
export const EXTRAORDINARY_DISCOUNT = 70;
/* How close a price we recorded has to come to the reference to support it. */
const SUPPORT_RATIO = 0.8;

export function displayDiscount(
  price: number,
  referencePrice: number | null,
  history: PricePoint[] = [],
): number | null {
  const percent = discountPercent(price, referencePrice);
  if (percent === null || referencePrice === null) return null;
  if (percent < EXTRAORDINARY_DISCOUNT) return percent;

  /* Our own observations are the only independent evidence we hold today. A
     catalogue card carries none, so an extraordinary claim never survives
     there — which is the right default for a number this loud. */
  const ourHighest = history.reduce((high, point) => Math.max(high, point.price), 0);
  return ourHighest >= referencePrice * SUPPORT_RATIO ? percent : null;
}
