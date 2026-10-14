import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/site/Prose";
import { StructuredData } from "@/components/site/StructuredData";
import { SITE_ORIGIN, breadcrumbSchema, graph, itemListSchema } from "@/lib/pageSchema";
import { guides, GUIDE_MARKETS } from "@/src/seoContent";

type Props = { params: Promise<{ market: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market } = await params;
  return { title: "Deal guides and price-checking advice", description: "Understand real discounts, the OneDailyDrop Score and how to compare watch, LEGO and art supply offers.", alternates: { canonical: `/${market}/guides`, languages: Object.fromEntries(GUIDE_MARKETS.map(code => [`en-${code === "uk" ? "GB" : code.toUpperCase()}`, `/${code}/guides`])) } };
}
export default async function GuidesPage({ params }: Props) {
  const { market } = await params;
  if (!GUIDE_MARKETS.includes(market)) notFound();
  return <>
    <StructuredData data={graph(
      breadcrumbSchema(market, [["Deal guides"]]),
      itemListSchema("Deal guides", guides.map(guide => ({
        name: guide.title,
        url: `${SITE_ORIGIN}/${market}/guides/${guide.slug}`,
      }))),
    )} />
    <Prose market={market} crumb="Deal guides" title="Deal guides" lede="A price is a number. A good buying decision needs the evidence behind it.">
      {guides.map(guide => <section key={guide.slug} className="rounded-2xl border border-border p-6"><h2 className="text-xl font-bold text-fg"><Link href={`/${market}/guides/${guide.slug}`}>{guide.title}</Link></h2><p className="mt-3">{guide.description}</p></section>)}
    </Prose>
  </>;
}
