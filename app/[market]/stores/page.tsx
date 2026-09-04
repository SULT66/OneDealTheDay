import type { Metadata } from "next";
import Link from "next/link";
import { getConnectedShops, getMarket } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";
import { StoreMarquee } from "@/components/site/StoreMarquee";

/**
 * Who OneDailyDrop is actually connected to.
 *
 * This URL was a 404 while the site invited retailers to partner with it. An
 * affiliate manager reading a pitch looks for exactly this page first — who
 * else is already here — and found a broken link, which answers the question
 * in the worst possible way.
 *
 * It first shipped as a table of shop, listing count and the network each feed
 * arrives through. Accurate, and wrong for the page: which network a shop
 * reaches us by is our plumbing, not something a visitor came here to read,
 * and printing it made a page about shops read like a technical appendix. The
 * shops are the content, so the shops are what is on it.
 *
 * The list is still read from the catalogue rather than kept by hand, so it
 * cannot name a shop that has stopped supplying listings.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Stores we work with",
    description:
      "The retailers whose listings appear on OneDailyDrop, and how to be added.",
    alternates: { canonical: `/${market}/stores` },
  };
}

export default async function StoresPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  const info = getMarket(market);
  const shops = await getConnectedShops(market);
  const total = shops.reduce((sum, shop) => sum + shop.listings, 0);

  return (
    <Prose
      market={market}
      crumb="Stores"
      title="Stores we work with"
      lede="Every retailer whose listings appear here."
    >
      <p>
        These are the shops connected to OneDailyDrop in{" "}
        {info?.country ?? "this market"} today &mdash;{" "}
        {total.toLocaleString("en-US")} listings between them. Every name links
        straight through to that shop.
      </p>

      <StoreMarquee market={market} shops={shops} />

      {/* Required, and kept to one sentence. The FTC asks for a disclosure a
          visitor can find near the links it describes, and an affiliate manager
          reviewing this site looks for the same thing. It is also simply true,
          and a page that hides how it is paid for is a page nobody should
          believe. */}
      <p className="text-sm text-fg-muted">
        These are affiliate links: we may earn a commission on anything you buy
        at these shops, at no cost to you and with no change to any price.
      </p>

      <h2>What being here does and does not mean</h2>
      <p>
        A shop appearing on this page supplies us with its listings. It does not
        mean the shop pays for placement, chooses which of its products appear,
        or has any say in how they are scored &mdash; none of those are things
        we sell. A retailer sees the same ranking rules as every other retailer,
        and can be outranked by them on its own listings.
      </p>
      <p>
        It also does not mean every listing a shop sends is published. Listings
        arrive, get checked, and most of them do not become the Daily Drop or a
        Live Drop, which is the point of having a bar at all.
      </p>

      <h2>Being added</h2>
      <p>
        The <Link href={`/${market}/for-retailers`}>partner page</Link> covers
        what we need in a feed, how listings are scored, and what a Live Drop
        involves. If you run a shop and want to be on this list, write to{" "}
        <a href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
    </Prose>
  );
}
