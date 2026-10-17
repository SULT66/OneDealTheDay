import Link from "next/link";
import {notFound} from "next/navigation";
import {getBrand} from "@/lib/brands";
import {getLanguage, t} from "@/lib/i18n";
import {filterFromSearchParams, applyFilter} from "@/lib/filter";
import {DealListing} from "@/components/catalog/DealListing";
import {StructuredData} from "@/components/site/StructuredData";

export async function generateMetadata({params}: PageProps<'/[market]/brand/[slug]'>) {
  const {market, slug} = await params;
  const language = await getLanguage(market);
  const data = await getBrand(market, slug, language);
  if (!data) notFound();
  return {title: data.brand, alternates: {canonical: "/" + market + "/brand/" + slug}};
}

export default async function BrandPage({params, searchParams}: PageProps<'/[market]/brand/[slug]'>) {
  const {market, slug} = await params;
  const query = await searchParams;
  const language = await getLanguage(market);
  const data = await getBrand(market, slug, language);
  if (!data) notFound();
  const filter = filterFromSearchParams(query);
  const deals = applyFilter(data.deals, filter);
  const page = Math.min(Math.max(1, Math.floor(Number(query.page) || 1)), Math.max(1, Math.ceil(deals.length / 24)));
  const origin = "https://www.onedailydrop.com";
  const url = origin + "/" + market + "/brand/" + slug;
  return <>
    <div className="mx-auto max-w-7xl px-5 pt-8 text-sm text-fg-muted">
      <Link href={"/" + market + "/brands"} className="underline">{t(language, "page.brands")}</Link>
      <p className="mt-3">{t(language, "page.averageProductRating")}: {data.summary.average_rating == null ? t(language, "page.noRatingData") : data.summary.average_rating.toFixed(1) + " / 5"}</p>
      <p>{t(language, "page.ratingCoverage", {rated: data.summary.rated_products, total: data.summary.products})}</p>
    </div>
    <DealListing market={market} basePath={"/" + market + "/brand/" + slug}
      title={t(language, "page.moreBrandDeals", {brand: data.brand})} filter={filter}
      deals={deals} scopedDeals={data.deals} searchParams={query} page={page}/>
    <StructuredData data={{"@context": "https://schema.org", "@graph": [
      {"@type": "Brand", name: data.brand, url},
      {"@type": "ItemList", name: data.brand, numberOfItems: deals.length,
        itemListElement: deals.slice((page - 1) * 24, page * 24).map((deal, index) => ({
          "@type": "ListItem", position: (page - 1) * 24 + index + 1, name: deal.title,
          url: origin + "/" + market + "/deal/" + deal.id
        }))},
      {"@type": "BreadcrumbList", itemListElement: [
        {"@type": "ListItem", position: 1, name: t(language, "page.home"), item: origin + "/" + market},
        {"@type": "ListItem", position: 2, name: t(language, "page.brands"), item: origin + "/" + market + "/brands"},
        {"@type": "ListItem", position: 3, name: data.brand, item: url}
      ]}
    ]}}/>
  </>;
}
