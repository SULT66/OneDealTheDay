import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Editorial policy, moved onto the current design.
 *
 * The wording is carried over from the Express version word for word: this is
 * the text the site is held to, so it was moved, not rewritten. Only the chrome
 * around it changed.
 *
 * The params type is spelled out rather than using the generated `PageProps`
 * helper so a brand-new route compiles on a clean checkout.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Editorial Policy",
    description: "How OneDailyDrop keeps deal recommendations useful, understandable and independent.",
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/editorial-policy` },
  };
}

export default async function EditorialPolicyPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Editorial policy"
      title="Editorial Policy"
      lede="Our goal is to make deal recommendations useful, understandable and independent."
    >
      <h2>Selection standards</h2>
      <p>
        Products may be evaluated using current price, price history when available, discount quality, customer rating, review volume, availability, retailer reliability, usefulness and category relevance.
      </p>
      <h2>Independence</h2>
      <p>
        Retailers and brands cannot purchase a guaranteed positive recommendation or score. Sponsored placements, if introduced, will be clearly identified and kept separate from independent editorial selections.
      </p>
      <h2>Accuracy</h2>
      <p>
        We aim to verify prices, availability and core product details before publication. Because retailer information can change quickly, the checkout page remains the final source for price and availability.
      </p>
      <h2>Corrections</h2>
      <p>
        Material errors should be corrected promptly. Readers can report an issue to <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a> with the product name, retailer and page URL.
      </p>
      <h2>Reviews and ratings</h2>
      <p>
        Retailer ratings and review counts are third-party signals, not OneDailyDrop endorsements. We may exclude products with suspicious, insufficient or unreliable feedback.
      </p>
      <h2>Affiliate compensation</h2>
      <p>
        Affiliate commissions may support the operation of the site, but commission rate should not override shopper value or factual accuracy.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Last updated: July 22, 2026</p>
    </Prose>
  );
}
