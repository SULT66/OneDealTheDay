import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Terms of use, moved onto the current design.
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
    title: "Terms of Use",
    description: "The terms you agree to by using OneDailyDrop.",
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/terms` },
  };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Terms"
      title="Terms of Use"
      lede="By using OneDailyDrop, you agree to these terms."
    >
      <h2>Informational service</h2>
      <p>
        OneDailyDrop provides product information, deal discovery and links to third-party retailers. We do not sell or fulfill the products displayed on the site.
      </p>
      <h2>Prices and availability</h2>
      <p>
        Prices, discounts, shipping, taxes, inventory and product details may change without notice. The retailer’s checkout page controls the final price and terms of purchase.
      </p>
      <h2>Affiliate relationships</h2>
      <p>
        Some outbound links are affiliate links. OneDailyDrop may receive compensation from qualifying purchases, at no extra cost to the shopper.
      </p>
      <h2>No warranties</h2>
      <p>
        The site is provided on an “as is” and “as available” basis. We do not guarantee that every price, rating, review count, description or availability status is complete, current or error-free.
      </p>
      <h2>Third-party websites</h2>
      <p>
        Retailer websites are operated independently. OneDailyDrop is not responsible for their content, privacy practices, products, customer service, returns or transactions.
      </p>
      <h2>Acceptable use</h2>
      <p>
        You may not misuse the site, interfere with its operation, scrape it in a manner that harms service availability, attempt unauthorized access or use its content unlawfully.
      </p>
      <h2>Intellectual property</h2>
      <p>
        OneDailyDrop branding, original text, scoring presentation and site design are protected by applicable intellectual-property laws. Retailer names, trademarks and product images belong to their respective owners.
      </p>
      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, OneDailyDrop will not be liable for indirect, incidental or consequential losses arising from use of the site or a third-party purchase.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms may be sent to <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Effective: July 22, 2026</p>
    </Prose>
  );
}
