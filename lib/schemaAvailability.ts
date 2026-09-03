/**
 * The schema.org availability a listing has actually earned.
 *
 * The product page published `https://schema.org/InStock` unconditionally, so
 * every listing told Google the item was in stock. Most of them had never been
 * told any such thing: Newegg's feed carries no stock field at all, and the
 * importer used to fill that silence with "Available" — 1,248 listings
 * claiming stock on the strength of nothing.
 *
 * Three answers, and silence is one of them. An unknown state publishes no
 * availability rather than a false one, which is what the Express markup has
 * always done and what the page itself says when it prints "Confirm at
 * retailer".
 */
export function schemaAvailability(availability: string): string | undefined {
  const text = String(availability || "").toLowerCase();
  if (/out of stock|sold out|unavailable|discontinued|expired/.test(text)) {
    return "https://schema.org/OutOfStock";
  }
  if (/pre.?order/.test(text)) return "https://schema.org/PreOrder";
  if (/in stock|available|ships|delivery/.test(text)) return "https://schema.org/InStock";
  /* "Confirm at retailer", or nothing at all: we do not know, so we do not
     say. */
  return undefined;
}
