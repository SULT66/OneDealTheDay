import { AffiliateNotice } from "@/components/site/AffiliateNotice";
import { getLanguage } from "@/lib/i18n";
import { notFound } from "next/navigation";
import { getMarket, getMarkets } from "@/lib/catalog";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { DeliaProvider } from "@/components/delia/DeliaContext";
import { ClickAttribution } from "@/components/site/ClickAttribution";
import { PageViews } from "@/components/site/PageViews";

/**
 * Everything lives under a market segment, mirroring the live site's /us URLs
 * so a future switchover keeps its search rankings. Only `us` is populated
 * today; adding `uk` or `de` is a data change, not a routing one.
 */
export function generateStaticParams() {
  return getMarkets().map((m) => ({ market: m.code }));
}

export default async function MarketLayout({
  children,
  params,
}: LayoutProps<"/[market]">) {
  const { market } = await params;
  if (!getMarket(market)) notFound();
  const language = await getLanguage(market);

  return (
    <DeliaProvider market={market} language={language}>
      {/* Stamps the visitor's session onto outbound links in the browser.
          Must not be rendered into the href on the server: these pages are
          cached, and a baked-in id would be shared by every later visitor. */}
      <ClickAttribution />
      {/* Visitors and where they came from, for the admin numbers. */}
      <PageViews />
      <Header market={market} />
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-7xl px-5 py-3 sm:px-8">
          <AffiliateNotice market={market} language={language} />
        </div>
        {children}
      </main>
      <Footer market={market} />
    </DeliaProvider>
  );
}
