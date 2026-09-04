import type { Metadata } from "next";
import Link from "next/link";
import { getConnectedShops, getMarket } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

/**
 * Who OneDailyDrop is actually connected to.
 *
 * This URL was a 404 while the site invited retailers to partner with it. An
 * affiliate manager reading a pitch looks for exactly this page first — who
 * else is already here — and found a broken link, which answers the question
 * in the worst possible way.
 *
 * The list is read from the catalogue rather than kept by hand, so it cannot
 * name a shop that has stopped supplying listings, and the counts beside each
 * name are the ones a visitor can go and verify in the same catalogue.
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
      "The retailers whose listings appear on OneDailyDrop, how they reach us, and what it takes to be added.",
    alternates: { canonical: `/${market}/stores` },
  };
}

/* How each shop's listings reach us. Kept here rather than in the catalogue
   because it describes a commercial relationship, not a product. */
const HOW_THEY_REACH_US: Record<string, string> = {
  eBay: "eBay Partner Network, through the Browse API",
  Newegg: "Rakuten Advertising, through the product search API",
  Tribesigns: "Awin product feed",
  Mooncool: "Awin product feed",
  Giftlab: "Awin product feed",
  "King Koil": "Awin product feed",
};

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
      lede="Every retailer whose listings appear here, and how each one reaches us."
    >
      <p>
        These are the shops connected to OneDailyDrop in{" "}
        {info?.country ?? "this market"} today — {total.toLocaleString("en-US")}{" "}
        listings between them. The list is read from the catalog itself rather
        than kept by hand, so a shop that stops supplying listings stops
        appearing here without anybody having to remember to remove it.
      </p>

      <table>
        <thead>
          <tr>
            <th scope="col">Store</th>
            <th scope="col">Listings</th>
            <th scope="col">How its listings reach us</th>
          </tr>
        </thead>
        <tbody>
          {shops.map((shop) => (
            <tr key={shop.retailer}>
              <td>{shop.retailer}</td>
              <td className="tnum">{shop.listings.toLocaleString("en-US")}</td>
              <td>{HOW_THEY_REACH_US[shop.retailer] ?? "Affiliate product feed"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>What being here does and does not mean</h2>
      <p>
        A shop appearing on this page has an affiliate relationship with us and
        supplies a product feed or an API. It does not mean the shop pays for
        placement, chooses which of its products appear, or has any say in how
        they are scored — none of those are things we sell. A retailer sees the
        same ranking rules as every other retailer, and can be outranked by them
        on its own listings.
      </p>
      <p>
        It also does not mean every listing a shop sends is published. Listings
        arrive, get checked, and most of them do not become the Daily Drop or a
        Live Drop, which is the point of having a bar at all.
      </p>

      <h2>Being added</h2>
      <p>
        We connect through the usual affiliate networks — Awin, Rakuten
        Advertising, Impact, CJ — and can read a standard product feed or a
        documented API. The{" "}
        <Link href={`/${market}/for-retailers`}>partner page</Link> covers what
        we need in a feed, how listings are scored, and what a Live Drop
        involves.
      </p>
      <p>
        If you run a shop and want to be on this list, write to{" "}
        <a href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>.
      </p>
    </Prose>
  );
}
