import type { Metadata } from "next";
import Link from "next/link";
import { filterFromSearchParams, getMarket, searchDeals } from "@/lib/catalog";
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
  const query = await searchParams;
  const filter = filterFromSearchParams(query);
  const page = Number(Array.isArray(query.page) ? query.page[0] : query.page) || 1;
  /* Set by the "search instead for" link below, and by nothing else: it is
     how a shopper insists on the words they typed. */
  const exact = (Array.isArray(query.exact) ? query.exact[0] : query.exact) === "1";
  const { deals, correction: correctedSearch } = await searchDeals(market, filter, { exact });
  const language = await getLanguage(market);

  /*
   * When the words that were typed found nothing and something close did, the
   * page says which search it is showing and offers the original back. Both
   * halves matter: the results are useful, and the shopper is not left
   * wondering why they are looking at sofas having asked for a couch.
   */
  const correction = correctedSearch ? (
    <span className="block">
      {t(language, "app.search.correctedTo", { corrected: correctedSearch.to })}{" "}
      <Link
        href={`/${market}/search?q=${encodeURIComponent(correctedSearch.from)}&exact=1`}
        className="underline underline-offset-2"
      >
        {t(language, "app.search.searchInstead", { query: correctedSearch.from })}
      </Link>
    </span>
  ) : null;

  return (
    <DealListing
      market={market}
      basePath={`/${market}/search`}
      filter={filter}
      deals={deals}
      page={page}
      searchParams={query}
      title={
        filter.query
          ? t(language, "app.search.resultsFor", { query: filter.query })
          : t(language, "app.list.allCheckedDeals")
      }
      intro={
        <>
          {correction}
          {filter.query
            ? t(language, "app.search.matchingIntro")
            : t(language, "app.search.allIntro")}
        </>
      }
      crumb={filter.query ? t(language, "nav.search") : t(language, "app.list.allDeals")}
    />
  );
}
