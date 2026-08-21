import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { getActiveRetailers, getMarket, getPriceBounds } from "@/lib/catalog";
import type { Deal, DealFilter } from "@/lib/types";
import { getLanguage, t } from "@/lib/i18n";
import { DealCard } from "@/components/deal/DealCard";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { FilterPanel, type FilterCopy } from "./FilterPanel";
import { FilterShell } from "./FilterShell";

/**
 * Shared listing shell for the category pages and search results — one layout,
 * one filter panel, one empty state, so the two routes cannot drift apart.
 */
export async function DealListing({
  market,
  basePath,
  filter,
  deals,
  title,
  intro,
  crumb,
}: {
  market: string;
  /** Path without a query string; the filter panel appends its own. */
  basePath: string;
  filter: DealFilter;
  deals: Deal[];
  title: string;
  intro?: ReactNode;
  crumb?: string;
}) {
  const language = await getLanguage(market);
  /* Built here rather than inside FilterPanel: that panel is a client component
     and cannot reach the request's language. */
  const filterCopy: FilterCopy = {
    activeFilters: t(language, "search.activeFilters"),
    clearAll: t(language, "app.filter.clearAll"),
    removeFilter: t(language, "app.filter.removeFilter"),
    maximumPrice: t(language, "app.filter.maximumPrice"),
    retailer: t(language, "product.retailer"),
    productRating: t(language, "product.productRating"),
    score: t(language, "product.oneDailyDropScore"),
    belowReferenceOnly: t(language, "app.filter.belowReferenceOnly"),
    belowReference: t(language, "product.belowReference"),
    sortBy: t(language, "search.sortBy"),
    any: t(language, "app.filter.any"),
    scoreAtLeast: t(language, "app.filter.scoreAtLeast", {
      score: Number(filter.minScore ?? 0),
    }),
    matchCount:
      deals.length === 1
        ? t(language, "app.filter.matchCountOne")
        : t(language, "app.filter.matchCount", { count: deals.length }),
    sorts: {
      score: t(language, "app.filter.bestScore"),
      "price-asc": t(language, "app.filter.priceAsc"),
      "price-desc": t(language, "app.filter.priceDesc"),
      rating: t(language, "app.filter.highestRated"),
      discount: t(language, "app.filter.biggestSaving"),
    },
  };
  const [retailers, bounds] = await Promise.all([
    getActiveRetailers(market),
    getPriceBounds(market),
  ]);
  const currency = getMarket(market)?.currency ?? "USD";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <nav aria-label={t(language, "app.list.breadcrumb")} className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
          <li>
            <Link href={`/${market}`} className="hover:text-fg">
              {t(language, "page.home")}
            </Link>
          </li>
          <li aria-hidden="true">
            <CaretRight size={13} weight="bold" className="text-fg-subtle" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {crumb ?? title}
          </li>
        </ol>
      </nav>

      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        {intro && (
          <p className="mt-3 text-base leading-relaxed text-fg-muted">{intro}</p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:gap-10">
        {/* Collapsed behind a button on mobile so results are not pushed off
            screen; always open from lg where the sidebar has its own column. */}
        <aside>
          <FilterShell>
            <FilterPanel
              basePath={basePath}
              filter={filter}
              market={market}
              currency={currency}
              retailers={retailers}
              bounds={bounds}
              copy={filterCopy}
            />
          </FilterShell>
        </aside>

        <div>
          {deals.length === 0 ? (
            <div className="rounded-card border border-border bg-surface p-10 text-center">
              <h2 className="text-lg font-bold text-fg">
                {t(language, "app.list.noMatches")}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-fg-muted">
                Every listing here has to clear our price, rating and seller
                checks, so narrow filters can empty the page. Try widening the
                price range or clearing a filter.
              </p>
              <Link
                href={basePath}
                className="mt-6 inline-flex h-12 cursor-pointer items-center rounded-full bg-surface-inverse px-6 text-sm font-semibold text-fg-on-inverse transition-opacity hover:opacity-88"
              >
                {t(language, "app.list.clearFilters")}
              </Link>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {deals.map((deal, i) => (
                <li key={deal.id}>
                  <DealCard
                    deal={deal}
                    market={market}
                    index={i}
                    priority={i < 3}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <DeliaTrigger variant="floating" />
    </div>
  );
}
