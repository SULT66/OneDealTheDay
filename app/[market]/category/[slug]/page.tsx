import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  filterFromSearchParams,
  getCategories,
  getCategory,
  getDeals,
  getMarket,
  getMarkets,
} from "@/lib/catalog";
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
  const category = getCategory(slug);
  if (!category) return {};

  const info = getMarket(market);
  return {
    title: `${category.name} deals in ${info?.country ?? "your market"}`,
    description: `${category.blurb} Every pick is checked against price, product rating and seller signals.`,
    alternates: { canonical: `/${market}/category/${slug}` },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/[market]/category/[slug]">) {
  const { market, slug } = await params;
  const category = getCategory(slug);
  if (!category) notFound();

  const filter = { ...filterFromSearchParams(await searchParams), category: slug };
  const deals = await getDeals(market, filter);

  return (
    <DealListing
      market={market}
      basePath={`/${market}/category/${slug}`}
      // The category is fixed by the route, so it is not a removable filter.
      filter={{ ...filter, category: undefined }}
      deals={deals}
      title={`${category.name} deals`}
      intro={category.blurb}
      crumb={category.name}
    />
  );
}
