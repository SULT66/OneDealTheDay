import type { Metadata } from "next";
import { getCatalogSize, getCategories, getMarket } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "About OneDailyDrop",
  description:
    "What OneDailyDrop checks before it recommends anything, how it makes money, and what it deliberately does not do.",
};

/**
 * Rewritten to describe the site as it now works.
 *
 * The previous version was written when the daily drop *was* the product —
 * "a daily shortlist instead of an endless sale page", "we do not want to be
 * another giant catalog". The site has since become a searchable catalog with
 * an assistant on top, and the drop is one feature inside it. A visitor who
 * read the old About and then used the site was being told two different
 * stories, which costs more trust than a plain page ever earns.
 */
export default async function AboutPage({
  params,
}: PageProps<"/[market]/about">) {
  const { market } = await params;
  const info = getMarket(market);
  const catalogSize = await getCatalogSize(market);

  return (
    <Prose
      market={market}
      crumb="About"
      title="About OneDailyDrop"
      lede="A shopping site that checks the offer before it recommends it, and shows you the working."
    >
      <p>
        OneDailyDrop is a search-and-compare site for{" "}
        {info?.country ?? "your market"}: {catalogSize} listings across{" "}
        {getCategories().length} categories, each one checked before it is
        published. Delia, the assistant, searches those checked listings and
        nothing else. Once a day we also publish a Daily Drop — the picks that
        came out highest that morning — but that is one feature of the site
        rather than the whole of it.
      </p>

      <h2>What checked actually means</h2>
      <p>
        Before a listing appears here it has to have a working retailer link, a
        current price, a known delivery cost, a stated returns policy and stock.
        We re-check those links every night, and a listing whose link has died
        leaves the catalog rather than sitting there looking valid.
      </p>
      <p>
        On top of that we compare the price against verified reference figures,
        read product and seller feedback, and publish the reasoning next to
        every pick. Where a signal is missing, the page says it is missing.
      </p>

      <h2>What we deliberately do not do</h2>
      <ul>
        <li>We do not sell products, hold stock or take payments.</li>
        <li>We do not accept payment for placement or for a higher score.</li>
        <li>
          We do not invent reference prices. Where no verified previous price
          exists, no discount is shown — even if the retailer shows one.
        </li>
        <li>
          We do not guess specifications. Unknown details are left out rather
          than filled in.
        </li>
        <li>
          We do not pad the Daily Drop. If only seven listings clear the bar on
          a given day, seven are published.
        </li>
      </ul>

      <h2>How we make money</h2>
      <p>
        When you choose a deal we send you to the retailer, and we may earn an
        affiliate commission on what you buy. That commission adds no points to
        any score and plays no part in what gets recommended. It is the reason
        the site is free, and it is disclosed on every page that carries a
        retailer link.
      </p>

      <h2>Delia</h2>
      <p>
        Delia searches the checked catalog rather than the wider web, so
        anything she offers has already been through the same checks as
        everything else here. Speech recognition runs in your browser and needs
        no account; where a browser has none, the same assistant works by
        typing.
      </p>

      <h2>Who runs it</h2>
      <p>
        OneDailyDrop is an independent site run from Brooklyn, New York. It is
        not owned by, and takes no editorial direction from, any retailer whose
        products appear on it. Retailers who want to work with us can read the{" "}
        <a href={`/${market}/for-retailers`}>partner page</a>.
      </p>
    </Prose>
  );
}
