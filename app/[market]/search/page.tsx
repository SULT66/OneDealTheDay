import type { Metadata } from "next";
import { filterFromSearchParams, getDeals, getMarket } from "@/lib/catalog";
import { countryName, getLanguage, t } from "@/lib/i18n";
import { DealListing } from "@/components/catalog/DealListing";

export async function generateMetadata({
  params,
}: PageProps<"/[market]/search">): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    title: t(language, "app.search.metaTitle", { country }),
    description: t(language, "app.search.metaDescription"),
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
  const language = await getLanguage(market);

  return (
    <DealListing
      market={market}
      basePath={`/${market}/search`}
      filter={filter}
      deals={deals}
      title={
        filter.query
          ? t(language, "app.search.resultsFor", { query: filter.query })
          : t(language, "app.list.allCheckedDeals")
      }
      intro={
        filter.query
          ? t(language, "app.search.matchingIntro")
          : t(language, "app.search.allIntro")
      }
      crumb={filter.query ? t(language, "nav.search") : t(language, "app.list.allDeals")}
    />
  );
}
