import { Suspense } from "react";
import { activeHalloween, activeCampaign } from "@/src/merchandisingCalendar";
import { redirect } from "next/navigation";
import type { Language } from "@/lib/i18n";
import { StructuredData } from "@/components/site/StructuredData";
import type { Metadata } from "next";
import Link from "next/link";
import { HomeCampaigns } from "@/components/site/HomeCampaigns";
import {
  getCategoriesWithCounts,
  getMarket,
  getTopPicks,
} from "@/lib/catalog";
import { countryName, getLanguage, marketAlternates, t } from "@/lib/i18n";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SectionHeader } from "@/components/site/SectionHeader";
import { LiveDropSignup } from "@/components/site/LiveDropSignup";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { DealCard } from "@/components/deal/DealCard";
import { NextLiveDrop } from "@/components/live/NextLiveDrop";
import { AmazonPicks } from "@/components/site/AmazonPicks";
import { PartnerPicks } from "@/components/site/PartnerPicks";
import { HalloweenProducts } from "@/components/site/HalloweenProducts";
import { getHalloweenCollection } from "@/lib/merchandising";
import { MerchandisingShelves } from "@/components/site/MerchandisingShelves";

export async function generateMetadata({
  params,
}: PageProps<"/[market]">): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    /*
     * The brand comes first on the home page, and only here.
     *
     * The site-wide template puts it last, which is right for an inner page:
     * "Saved products | OneDailyDrop" leads with the useful half. On the page
     * people actually pin, a narrow tab showed "Checked d..." and nothing that
     * said whose site it was. `absolute` skips the template, so the name is
     * not repeated at both ends.
     */
    title: {
      absolute: language === "en" ? `Deals with price evidence in ${country} | OneDailyDrop` : `OneDailyDrop: ${t(language, "app.home.metaTitle", { country })}`,
    },
    description: t(language, "app.home.metaDescription", { country }),
    alternates: { canonical: `/${market}`, languages: marketAlternates() },
  };
}

export default async function MarketHome({ params, searchParams }: PageProps<"/[market]">) {
  const {market} = await params;
  const language = await getLanguage(market);
  const search = await searchParams;
  // Preserve old campaign filter bookmarks after moving the collection.
  if (['halloween_q','halloween_sort','halloween_page'].some(key => typeof search[key] === 'string')) {
    const query = new URLSearchParams({lang:language});
    for (const [oldKey,key] of [['halloween_q','q'],['halloween_sort','sort'],['halloween_page','page']]) {
      if (typeof search[oldKey] === 'string') query.set(key,search[oldKey]);
    }
    redirect(`/${market}/halloween?${query}`);
  }
  /* Two clocks, deliberately. The collection below sells, so it closes at the
     delivery cutoff; the banner above only talks, so it runs to Halloween
     itself and changes what it promises once the cutoff has passed. Black
     Friday appears from its preparation window, which is where the price
     records that make it worth anything are being written. */
  const halloween = Boolean(activeHalloween({market}));
  const halloweenBanner = activeCampaign({eventKey:'halloween', market, throughEvent:true});
  const blackFriday = Boolean(activeCampaign({eventKey:'black-friday', market, fromPreparation:true}));
  return <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 sm:pt-5">
    <Suspense fallback={<HomeCampaigns market={market} language={language} blackFriday={blackFriday}/> }>
      <RegionalCampaigns market={market} language={language} halloween={Boolean(halloweenBanner)}
        halloweenLate={Boolean(halloweenBanner?.pastDeliveryCutoff)} blackFriday={blackFriday}/>
    </Suspense>
    <Suspense fallback={null}><HomeCatalog market={market} language={language} halloween={halloween} /></Suspense>
    <DeliaTrigger variant="floating" />
  </div>;
}

async function RegionalCampaigns({market,language,halloween,halloweenLate,blackFriday}:{market:string;language:Language;halloween:boolean;halloweenLate:boolean;blackFriday:boolean}) {
  const data=halloween ? await getHalloweenCollection(market,language,1,'','popular',true) : null;
  const hasCollection=Boolean(data && !data.unavailable && data.total>0);
  return <div data-odd-transient={data?.unavailable ? "1" : undefined}>
    <HomeCampaigns market={market} language={language} halloween={hasCollection}
      halloweenLate={halloweenLate} blackFriday={blackFriday} halloweenQueries={data?.availableQueries || []}/>
    {hasCollection && data && data.products.length>0 && <HalloweenProducts market={market} language={language} data={data} preview/>}
  </div>;
}

async function HomeCatalog({market,language,halloween}:{market:string;language:Language;halloween:boolean}) {
  const info = getMarket(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  const [picksResult,categoriesResult] = await Promise.allSettled([
    getTopPicks(market,12),
    getCategoriesWithCounts(market,language),
  ]);
  const picks = picksResult.status === 'fulfilled' ? picksResult.value : [];
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
  const unavailable = picksResult.status === 'rejected' || categoriesResult.status === 'rejected';
  /* Honest empty state rather than a crash — no sample prices or products are
     invented while the catalog for this market is empty (a source outage, or
     before the first refresh has ever run). */
  if (!picks.length && !halloween) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center sm:px-6" data-odd-transient="1">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {country}
        </p>
        <h2 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {t(language, "app.home.emptyTitle")}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          {t(language, "app.home.emptyText")}
        </p>
        {/* A scheduled drop does not depend on the catalog. If a refresh has
            failed, the drop is the one thing still worth arriving for, so it
            survives the empty state instead of disappearing with everything
            else. */}
        <NextLiveDrop market={market} />
        {/* And the hand-picked links, for the same reason: when the catalogue
            has nothing to offer, these are the only thing that does. They
            carry no price and no score, so an outage cannot make them
            misleading the way a stale catalogue would. */}
        <div className="mt-4 text-left">
          <AmazonPicks market={market} />
          <MerchandisingShelves market={market} language={language} excludeHalloween={halloween} />
        </div>
      </div>
    );
  }

  const homeSchema = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebSite", "@id": "https://www.onedailydrop.com/#website", name: "OneDailyDrop", url: "https://www.onedailydrop.com" },
    { "@type": "ItemList", name: "Best right now", numberOfItems: picks.length, itemListElement: picks.map((deal, index) => ({ "@type": "ListItem", position: index + 1, name: deal.title, url: `https://www.onedailydrop.com/${market}/deal/${deal.id}` })) }
  ] };
  return (
    <div data-odd-transient={unavailable ? "1" : undefined}>
      <StructuredData data={homeSchema} />

      {/* Directly under the hero, and only when a drop is actually scheduled:
          it renders nothing the rest of the time. */}
      <NextLiveDrop market={market} />

      <MerchandisingShelves market={market} language={language} excludeHalloween={halloween} />

      {/* ---------------------------------------------------------- categories */}
      <section aria-labelledby="categories-title" className="mt-20">
        <SectionHeader
          id="categories-title"
          eyebrow={t(language, "app.home.browseEyebrow")}
          title={t(language, "app.home.exploreCategories")}
          action={{
            href: `/${market}/search`,
            label: t(language, "app.home.seeAllDeals"),
          }}
        />

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/${market}/category/${c.slug}`}
                className="flex h-full flex-col items-center gap-2.5 rounded-tile border border-border bg-surface px-3 py-6 text-center transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card"
              >
                <CategoryIcon name={c.icon} size={30} className="text-lime-deep" />
                <span className="text-sm font-semibold leading-tight text-fg">
                  {c.name}
                </span>
                <span className="text-xs text-fg-subtle tnum">
                  {t(language, "app.home.checkedCount", { count: c.count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------- best right now */}
      <section aria-labelledby="best-title" className="mt-20">
        <SectionHeader
          id="best-title"
          eyebrow={t(language, "app.home.bestEyebrow")}
          title={t(language, "app.home.bestTitle")}
          action={{
            href: `/${market}/search`,
            label: t(language, "app.home.seeAllDeals"),
          }}
        />

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {picks.map((deal, i) => (
            <li key={deal.id}>
              <DealCard deal={deal} market={market} index={i} />
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------ signup */}
      {/* Below the catalogue, never mixed into it: these have no price and no
          score, and a card without either sitting beside cards with both
          invites the reader to assume it was checked the same way. Renders
          nothing at all until a pick is added. */}
      <AmazonPicks market={market} />
      {/* Same terms as the shelf above, for shops reached through Sovrn. */}
      <PartnerPicks market={market} />

      {/* scroll-mt clears the sticky header when a visitor arrives via the
          header's CTA — on this page that's a same-page jump straight to
          #subscribe, on any other page it's a normal navigation that lands
          here already scrolled into view. */}
      <section id="subscribe" className="mt-20 scroll-mt-32">
        <LiveDropSignup market={market} source="homepage" />
      </section>

      {/* Follows the visitor down every page now — the large hero circle that
          used to sit on the seam between the two hero cards read as a stray
          floating button, so desktop leans on this and the header pill
          instead, same as every other page. */}
    </div>
  );
}
