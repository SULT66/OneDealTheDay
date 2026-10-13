import Link from "next/link";
import { StructuredData } from "@/components/site/StructuredData";
import { categoryAdvice, GUIDE_MARKETS } from "@/src/seoContent";
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
import { categoryName, countryName, getLanguage, marketAlternates, t } from "@/lib/i18n";
import { DealListing } from "@/components/catalog/DealListing";
import { MerchandisingShelves } from "@/components/site/MerchandisingShelves";

export function generateStaticParams() {
  return getMarkets().flatMap((m) =>
    getCategories().map((c) => ({ market: m.code, slug: c.slug })),
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/[market]/category/[slug]">): Promise<Metadata> {
  const { market, slug } = await params;
  const category = await resolveCategory(market, slug);
  if (!category) return {};

  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    title: language === "en" ? `${category.name} deals: prices and buying advice` : t(language, "app.category.metaTitle", {
      category: categoryName(category.name, language),
      country,
    }),
    description: t(language, "app.category.metaDescription", { blurb: category.blurb }),
    robots: { index: Object.keys(await searchParams).every(key => key === "lang"), follow: true },
    alternates: { canonical: `/${market}/category/${slug}`, languages: marketAlternates(`/category/${slug}`) },
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

  const advice = categoryAdvice[slug as keyof typeof categoryAdvice];
  const origin = "https://www.onedailydrop.com";
  const filtered = Object.keys(query).some(key => key !== "lang");
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: `${origin}/${market}` }, { "@type": "ListItem", position: 2, name, item: `${origin}/${market}/category/${slug}` }] },
    { "@type": "ItemList", name, numberOfItems: Math.min(deals.length, 24), itemListElement: deals.slice(0, 24).map((deal, index) => ({ "@type": "ListItem", position: index + 1, name: deal.title, url: `${origin}/${market}/deal/${deal.id}` })) }
  ] };
  return (<>
    {!filtered && <StructuredData data={schema} />}
    {!filtered && <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <MerchandisingShelves market={market} language={language} category={category.name} />
    </div>}
    <DealListing
      market={market}
      basePath={`/${market}/category/${slug}`}
      // The category is fixed by the route, so it is not a removable filter.
      filter={{ ...filter, category: undefined }}
      /* The filter above deliberately forgets the category, so the panel does
         not offer to remove something the URL fixes. The panel still has to
         know which shelf it is on, or it describes the whole market: on
         Furniture it offered King Koil, and choosing it emptied the page. */
      scopeCategory={category.name}
      deals={deals}
      title={t(language, "app.category.title", { category: name })}
      intro={category.blurb}
      crumb={name}
      page={page}
      searchParams={query}
    />
    {advice && language === "en" && <section className="mx-auto max-w-3xl px-5 pb-16 text-fg-muted" aria-label="Buying advice">
      <h2 className="mb-4 text-2xl font-bold text-fg">How to compare {name.toLowerCase()} deals</h2>
      <h3 className="mb-2 mt-6 text-lg font-semibold text-fg">{advice[0]}</h3><p>{advice[1]}</p>
      <h3 className="mb-2 mt-6 text-lg font-semibold text-fg">{advice[2]}</h3><p>{advice[3]}</p>
      <p className="mt-6">We display retailer-reported prices and available evidence. A listing here is not a guarantee of the lowest price or hands-on product testing. Prices and availability may change at checkout.</p>
      <p className="mt-4"><Link className="underline" href={`/${market}/how-we-select-deals`}>How we select listings</Link>{GUIDE_MARKETS.includes(market) && <> · <Link className="underline" href={`/${market}/guides/real-vs-fake-discounts`}>How to check a discount</Link> · <Link className="underline" href={`/${market}/guides`}>Niche buying guides</Link></>}</p>
    </section>}
    </>
  );
}
