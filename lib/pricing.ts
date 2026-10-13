/*
 * A saving this site is willing to state in its own voice.
 *
 * The reference price beside a listing is the seller's own "was" figure. It is
 * often real, and it is sometimes a different configuration, a multipack, or a
 * number typed once and never revisited: a storage cabinet sold at $124 quoted
 * a $939 reference, and the page printed "87% below reference" as though that
 * were a fact we had established. It was not.
 *
 * Suppressing only the extraordinary claims was the first attempt, and it drew
 * the line in the wrong place. Fifty per cent off a doubled list price is
 * exactly as unchecked as eighty-seven, and far more common: measured on
 * 2026-10-13, 330 listings printed a saving, 164 of them claimed half off or
 * better, and not one of the 2,380 listings in the catalogue carried an
 * independent comparison to support any of it. The page that says it verifies
 * every deal cannot also be the page doing that arithmetic.
 *
 * So the only percentage printed is the one we measured: how far today's price
 * sits below the highest daily price our own requests recorded — sixty days,
 * at least three of them, at least five per cent (src/trackedPrice.js). The
 * seller's reference still shows beside the price, named as theirs, with no
 * arithmetic of ours performed on it.
 */
export function trackedSaving(
  trackedDropPercent: number | null | undefined,
): number | null {
  const percent = Math.round(Number(trackedDropPercent) || 0);
  return percent > 0 ? percent : null;
}
