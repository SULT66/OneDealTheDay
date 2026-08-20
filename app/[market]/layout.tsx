import { notFound } from "next/navigation";
import { getMarket, getMarkets } from "@/lib/catalog";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { DeliaProvider } from "@/components/delia/DeliaContext";

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

  return (
    <DeliaProvider market={market}>
      <Header market={market} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer market={market} />
    </DeliaProvider>
  );
}
