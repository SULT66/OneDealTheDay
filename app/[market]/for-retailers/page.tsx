import type { Metadata } from "next";
import { getCatalogSize, getMarkets } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "Partner with OneDailyDrop",
  description:
    "What OneDailyDrop is, how listings are selected, what a retailer gets, and how to reach the partnerships contact.",
};

/**
 * The page an affiliate manager looks for before approving an application.
 *
 * Until now that person had to reconstruct the answer from About, the
 * methodology page and the affiliate disclosure. The questions they actually
 * ask — who runs this, how do listings get chosen, is placement for sale, what
 * traffic model is it, which markets — are answered here in one place, in the
 * order they are asked.
 *
 * Deliberately free of numbers that would date badly or flatter: no traffic
 * claims, no conversion promises. A page that overstates is worse than no page,
 * because the reviewer checks.
 *
 * The params type is written out rather than using the generated `PageProps`
 * helper so this route compiles on a clean checkout, before the route types
 * for a brand-new segment have been emitted.
 */
export default async function ForRetailersPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  const catalogSize = await getCatalogSize(market);
  const markets = getMarkets();

  return (
    <Prose
      market={market}
      crumb="For retailers"
      title="Partner with OneDailyDrop"
      lede="What we are, how listings are chosen, and what you can expect if your catalog appears here."
    >
      <h2>What OneDailyDrop is</h2>
      <p>
        An independent shopping site, run from Brooklyn, New York. Visitors
        search a catalog of listings that have been checked before publication,
        or ask Delia, our assistant, in plain language. We do not sell
        anything, hold stock or take payments; every purchase happens on the
        retailer&rsquo;s own site.
      </p>
      <p>
        We currently publish in {markets.length} markets (
        {markets.map((m) => m.country).join(", ")}), with {catalogSize} checked
        listings in this one.
      </p>

      <h2>How a listing gets published</h2>
      <p>
        A listing has to have a working commissionable link, a current price, a
        known delivery cost, a stated returns policy and stock. It is then
        scored on price evidence, product rating, review volume, seller history
        and delivery terms. Links are re-checked nightly and a dead one is
        withdrawn automatically.
      </p>
      <p>
        Placement is not for sale. Commission rate is not an input to any score,
        and no retailer can pay to appear, to rank higher, or to be the Daily
        Drop. If you ask us to feature a product, the honest answer will be no,
        which is the same answer your competitors get, and the reason a
        recommendation here is worth anything.
      </p>

      <h2>What a retailer gets</h2>
      <ul>
        <li>
          Buyers arriving with intent: they have read a price comparison and
          the reasoning behind a recommendation before they click.
        </li>
        <li>
          Listings shown with your delivery and returns terms attached, so the
          click is informed rather than a bounce.
        </li>
        <li>
          A dead or out-of-stock listing withdrawn without you having to tell
          us.
        </li>
        <li>
          No brand-bidding, no coupon-injection, no toolbar, no cookie-stuffing.
          Traffic is editorial and organic.
        </li>
      </ul>

      <h2>How the data reaches us</h2>
      <p>
        A standard product feed (CSV, TSV or XML over HTTPS) through your
        affiliate network, or a documented API. We need title, price, currency,
        image, deep link, availability and, importantly, delivery cost and
        returns terms. Without the last two a listing cannot become a Daily Drop
        candidate, because we will not publish a price that is not the price
        someone actually pays.
      </p>
      <p>
        A barcode (GTIN, EAN or UPC) or manufacturer part number on each row
        makes a substantial difference: it is what lets us match your offer
        against the same product elsewhere and show it in a comparison.
      </p>

      <h2>Editorial independence</h2>
      <p>
        Scoring, wording and selection are ours. We publish the criteria and the
        reasoning for each pick, and we say plainly when a signal is missing
        rather than filling the gap. Where a discount cannot be verified, none
        is displayed.
      </p>

      <h2>Talk to us</h2>
      <p>
        Affiliate and retail partnerships:{" "}
        <a href="mailto:info@onedailydrop.com">info@onedailydrop.com</a>. Tell us
        the network, the markets and where the feed lives, and we will tell you
        honestly whether the catalog is a fit.
      </p>
    </Prose>
  );
}
