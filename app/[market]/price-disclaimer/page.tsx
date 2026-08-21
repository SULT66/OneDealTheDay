import type { Metadata } from "next";
import { Prose } from "@/components/site/Prose";

/**
 * Price disclaimer, moved onto the current design.
 *
 * The wording is carried over from the Express version word for word: this is
 * the text the site is held to, so it was moved, not rewritten. Only the chrome
 * around it changed.
 *
 * The params type is spelled out rather than using the generated `PageProps`
 * helper so a brand-new route compiles on a clean checkout.
 */
export const metadata: Metadata = {
  title: "Price Disclaimer",
  description: "Retail prices and availability can change at any time. Always confirm the final offer with the retailer.",
};

export default async function PriceDisclaimerPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;

  return (
    <Prose
      market={market}
      crumb="Price disclaimer"
      title="Price Disclaimer"
      lede="Retail prices and availability can change at any time. Always confirm the final offer with the retailer."
    >
      <p>
        The price shown on the retailer’s website or at checkout is the controlling price.
      </p>
      <h2>Price changes</h2>
      <p>
        Product prices may change between the time OneDailyDrop checks an offer and the time a visitor reaches the retailer. Flash sales, coupons, membership pricing, location and inventory can affect the final amount.
      </p>
      <h2>Reference and original prices</h2>
      <p>
        An original, list or “was” price may come from retailer data or available price history. We only intend to present a discount as verified when the underlying data reasonably supports it.
      </p>
      <h2>Availability</h2>
      <p>
        Inventory, seller availability, delivery dates and shipping costs are controlled by the retailer and may vary by location.
      </p>
      <h2>Taxes, fees and coupons</h2>
      <p>
        Displayed prices may exclude tax, delivery, installation, subscriptions or other charges. Some prices may require a coupon, account, membership or promotional code.
      </p>
      <h2>Errors</h2>
      <p>
        Automated feeds and retailer pages can contain errors. Report suspected inaccuracies to <a className="font-medium text-fg underline underline-offset-4" href="mailto:info@onedailydrop.com">info@onedailydrop.com</a> and include the relevant page URL.
      </p>
      <p className="pt-4 text-sm text-fg-subtle">Last updated: July 22, 2026</p>
    </Prose>
  );
}
