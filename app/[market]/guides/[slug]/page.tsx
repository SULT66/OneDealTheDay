import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/site/Prose";
import { StructuredData } from "@/components/site/StructuredData";
import { DealCard } from "@/components/deal/DealCard";
import { getDeals } from "@/lib/catalog";
import { guides, GUIDE_MARKETS, EDITORIAL_DATE } from "@/src/seoContent";

type Props = { params: Promise<{ market: string; slug: string }> };
const origin = "https://www.onedailydrop.com";
function findGuide(market: string, slug: string) {
  return GUIDE_MARKETS.includes(market) ? guides.find(guide => guide.slug === slug) : undefined;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market, slug } = await params;
  const guide = findGuide(market, slug);
  if (!guide) return {};
  const path = `/guides/${slug}`;
  return { title: guide.title, description: guide.description, alternates: { canonical: `/${market}${path}`, languages: { ...Object.fromEntries(GUIDE_MARKETS.map(code => [`en-${code === "uk" ? "GB" : code.toUpperCase()}`, `/${code}${path}`])), "x-default": `/us${path}` } }, openGraph: { type: "article", title: guide.title, description: guide.description, url: `/${market}${path}` } };
}
export default async function GuidePage({ params }: Props) {
  const { market, slug } = await params;
  const guide = findGuide(market, slug);
  if (!guide) notFound();
  const url = `${origin}/${market}/guides/${slug}`;
  const all = guide.query || guide.category ? await getDeals(market, guide.category && !guide.query ? { category: guide.category } : {}) : [];
  // Exact brand token: do not fill a LEGO guide with compatible accessories.
  const matched = guide.query ? all.filter(deal => (deal.brand || "").toLowerCase() === guide.query.toLowerCase() && !/compatible|light(?:ing)? kit|display case|replacement|watch band|strap only/i.test(deal.title)) : all;
  const deals = matched.slice(0, 6);
  const graph = [
    { "@type": "Article", "@id": `${url}#article`, headline: guide.title, description: guide.description, mainEntityOfPage: url, datePublished: EDITORIAL_DATE, dateModified: EDITORIAL_DATE, inLanguage: "en", author: { "@type": "Organization", name: "OneDailyDrop", url: `${origin}/${market}/about` }, publisher: { "@type": "Organization", name: "OneDailyDrop", url: origin } },
    { "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/${market}` }, { "@type": "ListItem", position: 2, name: "Deal guides", item: `${origin}/${market}/guides` }, { "@type": "ListItem", position: 3, name: guide.title, item: url } ] },
    ...(deals.length ? [{ "@type": "ItemList", name: "Current catalogue listings", numberOfItems: deals.length, itemListElement: deals.map((deal, index) => ({ "@type": "ListItem", position: index + 1, name: deal.title, url: `${origin}/${market}/deal/${deal.id}` })) }] : [])
  ];
  return <>
    <StructuredData data={{ "@context": "https://schema.org", "@graph": graph }} />
    <Prose market={market} crumb="Deal guide" title={guide.title} lede={guide.description}>
      <p className="text-sm">By <Link className="underline" href={`/${market}/about`}>OneDailyDrop</Link> · Updated <time dateTime={EDITORIAL_DATE}>October 13, 2026</time>. Editorial guidance based on our selection system and recorded price data; we do not claim hands-on testing of these products.</p>
      {guide.sections.map(([heading, body]) => <section key={heading}><h2 className="mb-3 mt-8 text-xl font-bold text-fg">{heading}</h2><p>{body}</p></section>)}
      <p><Link className="underline" href={`/${market}/how-we-select-deals`}>Read our selection methodology</Link> · <Link className="underline" href={`/${market}/contact`}>Report a problem</Link></p>
      {guide.query || guide.category ? <section><h2 className="mb-4 text-xl font-bold text-fg">Current catalogue listings</h2>{deals.length ? <div className="grid gap-5 sm:grid-cols-2">{deals.map(deal => <DealCard key={deal.id} deal={deal} market={market} />)}</div> : <p>No matching listings are currently available in this market. Check back after the next catalogue update.</p>}</section> : null}
      <h2>More deal guides</h2><ul>{guides.filter(item => item.slug !== slug).map(item => <li key={item.slug}><Link className="underline" href={`/${market}/guides/${item.slug}`}>{item.title}</Link></li>)}</ul>
    </Prose>
  </>;
}
