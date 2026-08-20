import type { Metadata } from "next";
import { getCatalogSize, getCategories, getMarket } from "@/lib/catalog";
import { Prose } from "@/components/site/Prose";

export const metadata: Metadata = {
  title: "About OneDailyDrop",
  description:
    "What OneDailyDrop is, how it makes money, and what it deliberately does not do.",
};

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
      lede="A daily shortlist instead of an endless sale page — one genuinely good deal, with the evidence attached."
    >
      <p>
        Most shopping sites are optimised to show you more. OneDailyDrop is
        optimised to show you less: a single pick each day for{" "}
        {info?.country ?? "your market"}, plus the current shortlist behind it,
        across {getCategories().length} categories and{" "}
        {catalogSize} checked listings.
      </p>

      <h2>What we do</h2>
      <p>
        We track listings, compare prices against verified reference figures,
        read product and seller feedback, and publish the reasoning alongside
        every pick. If a listing has no verified discount or no reviews, the
        page says so rather than dressing it up.
      </p>

      <h2>How we make money</h2>
      <p>
        When you choose a deal we send you to the retailer, and we may earn an
        affiliate commission on what you buy. That commission adds no points to
        any score and plays no part in which item becomes the Daily Drop.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell products, hold stock or take payments.</li>
        <li>We do not accept payment for placement or for a higher Score.</li>
        <li>We do not invent reference prices to manufacture a discount.</li>
        <li>
          We do not guess specifications; unknown details are left out rather
          than filled in.
        </li>
      </ul>

      <h2>Delia</h2>
      <p>
        Delia is the voice assistant on this site. She searches only the checked
        picks — not the wider web — so anything she offers has already been
        through the same three checks as the Daily Drop. Speech recognition runs
        in your browser and needs no account; where a browser has none, the same
        assistant works by typing.
      </p>
    </Prose>
  );
}
