import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Affiliate disclosure, moved onto the current design.
 *
 * Keep the compensation explanation in sync with the Express fallback page.
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
    title: "Affiliate Disclosure",
    description: "OneDailyDrop may earn a commission when you click some retailer links or make a qualifying purchase.",
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/affiliate-disclosure` },
  };
}

export default async function AffiliateDisclosurePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Affiliate disclosure"
      title="Affiliate Disclosure"
      lede="OneDailyDrop may earn a commission when you click some retailer links or make a qualifying purchase."
    >
      <p>
        You do not pay more because a link is affiliated. A retailer or affiliate network may compensate OneDailyDrop for an eligible click or qualifying purchase.
      </p>
      <h2>How affiliate links work</h2>
      <p>
        Some links include tracking information that allows a retailer or affiliate network to identify that a shopper came from OneDailyDrop. Depending on the program, we may receive a commission for an eligible click, or for a qualifying purchase completed within the applicable attribution period. Not every link or click earns a payment.
      </p>
      <h2>Editorial independence</h2>
      <p>
        Compensation does not guarantee placement, a positive description or a favorable OneDailyDrop Score. We aim to prioritize usefulness, product quality, customer confidence, availability and retailer reliability.
      </p>
      <h2>Amazon disclosure</h2>
      <p>
        As an Amazon Associate I earn from qualifying purchases.
      </p>
      <h2>Questions</h2>
      <p>
        Questions about affiliate relationships may be sent to <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Last updated: September 13, 2026</p>
    </Prose>
  );
}
