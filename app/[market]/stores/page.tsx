import type { Metadata } from "next";
import { countryName, getLanguage, marketAlternates } from "@/lib/i18n";
import { SpanishStores, spanishMeta } from "@/components/site/SpanishPages";
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
      "Shop the retailers connected to OneDailyDrop, and learn how to be added.",
    ...((await getLanguage(market)) === "es" ? { title: spanishMeta.stores.title, description: spanishMeta.stores.description } : {}),
    alternates: { canonical: `/${market}/stores`, languages: marketAlternates("/stores") },
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

  /*
   * Amazon sits among the others, and behaves like them: the tile goes out to
   * the shop through a counted redirect, so anything bought after arriving
   * earns, not only a product we happened to name.
   *
   * It cannot be read off the catalogue the way the rest are — Amazon's
   * listings do not reach us as a feed, and their data is only ours to show
   * through an API that opens after three qualifying sales — so it is added
   * here by name. The count in the sentence above is listings, which is why
   * this contributes none.
   */
  const tiles = [
    ...shops,
    { retailer: "Amazon", listings: 0, host: "amazon.com", href: `/${market}/amazon/go/store` },
    ...(market === "us" && !shops.some((shop) => shop.retailer.toLowerCase() === "cozeware")
      ? [{
          retailer: "Cozeware", listings: 0, host: "cozeware.com",
          href: "https://www.awin1.com/cread.php?awinmid=123618&awinaffid=3018019&clickref=odd-store&ued=https%3A%2F%2Fwww.cozeware.com%2F",
        }]
      : []),
  ];

  if ((await getLanguage(market)) === "es") {
    return (
      <SpanishStores market={market} country={info ? countryName(market, "es") : "este mercado"} total={total} tiles={tiles} />
    );
  }

  return (
    <Prose
      market={market}
      crumb="Stores"
      title="Stores we work with"
      lede="Shop our connected retailers."
    >
      <p>
        These are the shops connected to OneDailyDrop in{" "}
        {info?.country ?? "this market"} today;{" "}
        {total.toLocaleString("en-US")} listings between them. Every name links
        straight through to that shop.
      </p>

      <StoreMarquee market={market} shops={tiles} />

      {market === "us" && !shops.some((shop) => shop.retailer.toLowerCase() === "cozeware") && (
        <p className="text-sm text-fg-muted">
          Visit Cozeware directly to browse its products. Individual Cozeware
          products are not yet listed on OneDailyDrop.
        </p>
      )}

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
        Some shops supply product listings; others are available through a
        direct store link. Appearing here does not
        mean the shop pays for placement, chooses which of its products appear,
        or has any say in how they are scored; none of those are things
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
