import type { Metadata } from "next";
import { getCatalogSize, getMarkets } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  return {
    title: "Partner with OneDailyDrop",
    description:
    "What OneDailyDrop is, how listings are selected, what a retailer gets, and how to reach the partnerships contact.",
    /* The same words live at five market prefixes; this says which one is the
       original rather than leaving search engines to pick. */
    alternates: { canonical: `/${market}/for-retailers` },
  };
}

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
        A listing has to have a working commissionable link, a current price and
        an image. It is then scored on price evidence, product rating, review
        volume, seller history and, where the source supplies them, delivery and
        returns terms. Links are re-checked nightly and a dead one is withdrawn
        automatically.
      </p>
      <p>
        {/* This said a known delivery cost and a stated returns policy were
            required before publication. They are not, and most of the catalogue
            does not carry them — a claim any partner can check in about a
            minute, and one worth more to us as an admission than as a
            promise. */}
        Delivery and returns are worth spelling out, because we are strict about
        them in one place and not in another. They are not required to be
        listed: eBay publishes both per listing, most product feeds publish
        neither, and a listing without them appears with &ldquo;confirm at
        retailer&rdquo; where the figure would go rather than a number we made
        up. They <em>are</em> required to be the Daily Drop or a Live Drop,
        because those put a price in front of somebody as a recommendation, and
        we will not recommend a price that is not the price they pay.
      </p>
      <p>
        Placement is not for sale. Commission rate is not an input to any score,
        and no retailer can pay to appear, to rank higher, or to be the Daily
        Drop. If you ask us to feature a product, the honest answer will be no,
        which is the same answer your competitors get, and the reason a
        recommendation here is worth anything.
      </p>

      {/* The format this page exists to explain, and did not mention at all
          while it was being pitched to merchants. */}
      <h2>Live Drop</h2>
      <p>
        One product, one price, ten minutes, announced in advance. Shoppers
        arrive at a waiting room before it opens; the price is not on the page
        and not in the page&rsquo;s data until the second it starts, so there is
        nothing to find early. An AI host presents the product and says the
        price out loud the moment it opens. When the ten minutes are up the
        offer closes and the page says so.
      </p>
      <p>
        It exists because a catalog rewards a shopper who is already looking.
        A Live Drop gives somebody a reason to arrive at a particular minute,
        and it gives one product the whole screen instead of a row in a grid.
      </p>
      <p>
        What we need from a retailer is a real offer: a product, a price that is
        genuinely better than the everyday one, a commissionable link, and the
        delivery and returns terms that go with it. We run the event, write the
        script, notify the people who asked to be reminded, and report back
        afterwards — how many waited, how many saw the reveal, how many clicked
        through. What we will not do is invent scarcity: we do not hold your
        stock and cannot see it, so the pressure in a Live Drop is the clock,
        which is real, and never a countdown of units, which would not be.
      </p>
      <p>
        If a first one interests you, the shortest version is a single product
        for ten minutes, with no commitment beyond that day.
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
