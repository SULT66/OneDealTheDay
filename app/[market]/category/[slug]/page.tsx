import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  filterFromSearchParams,
  getCategories,
  resolveCategory,
  getDeals,
  getMarket,
  getMarkets,
} from "@/lib/catalog";
import { categoryName, countryName, getLanguage, t } from "@/lib/i18n";
import { DealListing } from "@/components/catalog/DealListing";

export function generateStaticParams() {
  return getMarkets().flatMap((m) =>
    getCategories().map((c) => ({ market: m.code, slug: c.slug })),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/[market]/category/[slug]">): Promise<Metadata> {
  const { market, slug } = await params;
  const category = await resolveCategory(market, slug);
  if (!category) return {};

  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    title: t(language, "app.category.metaTitle", {
      category: categoryName(category.name, language),
      country,
    }),
    description: t(language, "app.category.metaDescription", { blurb: category.blurb }),
    alternates: { canonical: `/${market}/category/${slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/[market]/category/[slug]">) {
  const { market, slug } = await params;
  const category = await resolveCategory(market, slug);
  if (!category) notFound();

  const query = await searchParams;
  const filter = { ...filterFromSearchParams(query), category: slug };
  const page = Number(Array.isArray(query.page) ? query.page[0] : query.page) || 1;
  const deals = await getDeals(market, filter);
  const language = await getLanguage(market);
  const name = categoryName(category.name, language);

  return (
    <DealListing
      market={market}
      basePath={`/${market}/category/${slug}`}
      // The category is fixed by the route, so it is not a removable filter.
      filter={{ ...filter, category: undefined }}
      deals={deals}
      title={t(language, "app.category.title", { category: name })}
      intro={category.blurb}
      crumb={name}
      page={page}
      searchParams={query}
    />
  );
}
