import Link from "next/link";
import { methodology } from "@/src/methodology";
import { GUIDE_MARKETS } from "@/src/seoContent";
import type { Metadata } from "next";
import { getLanguage, marketAlternates } from "@/lib/i18n";
import { Prose } from "@/components/site/Prose";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  const page = methodology(await getLanguage(market));
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${market}/how-we-select-deals`, languages: marketAlternates("/how-we-select-deals") },
  };
}

export default async function HowWeSelectPage({ params }: PageProps<"/[market]/how-we-select-deals">) {
  const { market } = await params;
  const language = await getLanguage(market);
  const page = methodology(language);
  return <Prose market={market} crumb="Our methodology" title={page.title} lede={page.lede}>
    {page.sections.map(([title, text]: string[]) => <section key={title}><h2 className="mb-3 mt-8 text-xl font-bold text-fg">{title}</h2><p>{text}</p></section>)}
    <p>{page.updated}</p>
    <p>Published by OneDailyDrop. Our checks use retailer data and recorded price observations; they do not represent hands-on testing of every product.</p>
    {GUIDE_MARKETS.includes(market) && <p><Link className="underline" href={`/${market}/guides/onedailydrop-score`}>Public Score: calculation and limits</Link> · <Link className="underline" href={`/${market}/guides/real-vs-fake-discounts`}>How to check a discount</Link></p>}
  </Prose>;
}
