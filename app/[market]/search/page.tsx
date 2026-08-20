import type { Metadata } from "next";
import { filterFromSearchParams, getDeals, getMarket } from "@/lib/catalog";
import { DealListing } from "@/components/catalog/DealListing";

export async function generateMetadata({
  params,
}: PageProps<"/[market]/search">): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  return {
    title: `All checked deals in ${info?.country ?? "your market"}`,
    description:
      "Every current OneDailyDrop pick, filterable by price, retailer, rating and score.",
    // Filtered permutations are not separate pages worth indexing.
    robots: { index: false, follow: true },
  };
}

/**
 * The unscoped listing: the header's search box, the "see all deals" links and
 * Delia's hand-off when a request has no single category all land here.
 */
export default async function SearchPage({
  params,
  searchParams,
}: PageProps<"/[market]/search">) {
  const { market } = await params;
  const filter = filterFromSearchParams(await searchParams);
  const deals = await getDeals(market, filter);

  return (
    <DealListing
      market={market}
      basePath={`/${market}/search`}
      filter={filter}
      deals={deals}
      title={filter.query ? `Results for “${filter.query}”` : "All checked deals"}
      intro={
        filter.query
          ? `Matching listings from the current checked picks.`
          : "Every listing that has cleared our price, product and seller checks."
      }
      crumb={filter.query ? "Search" : "All deals"}
    />
  );
}
