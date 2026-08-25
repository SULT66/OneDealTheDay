import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  CaretRight,
  Check,
  Warning,
} from "@phosphor-icons/react/ssr";
import { getCategory, getDeal, getMarket, getRelated } from "@/lib/catalog";
import { categoryName, getLanguage, t } from "@/lib/i18n";
import {
  discountPercent,
  formatDateTime,
  formatPrice,
  retailerLabel,
} from "@/lib/format";
import { Rating } from "@/components/ui/Rating";
import { Pill } from "@/components/ui/Pill";
import { SectionHeader } from "@/components/site/SectionHeader";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { DealCard } from "@/components/deal/DealCard";
import { DealGallery } from "@/components/deal/DealGallery";
import { PriceBlock } from "@/components/deal/PriceBlock";
import { PriceHistory } from "@/components/deal/PriceHistory";
import { ScoreRing } from "@/components/deal/ScoreRing";
import { TrustSignals } from "@/components/deal/TrustSignals";

export async function generateMetadata({
  params,
}: PageProps<"/[market]/deal/[id]">): Promise<Metadata> {
  const { market, id } = await params;
  const deal = await getDeal(market, id);
  if (!deal) return {};

  const short =
    deal.title.length > 44 ? `${deal.title.slice(0, 44).trim()}…` : deal.title;

  return {
    title: `${short}: price, Score & buying guide`,
    description: `Check the current ${retailerLabel(deal.retailer)} price, OneDailyDrop Score, seller, delivery and returns for ${deal.title}.`,
    alternates: { canonical: `/${market}/deal/${id}` },
    openGraph: {
      title: short,
      images: deal.image ? [deal.image] : undefined,
    },
  };
}

export default async function DealPage({
  params,
}: PageProps<"/[market]/deal/[id]">) {
  const { market, id } = await params;
  const deal = await getDeal(market, id);
  if (!deal) notFound();

  const category = getCategory(deal.category);
  const language = await getLanguage(market);
  const localCategory = category ? categoryName(category.name, language) : deal.category;
  const related = await getRelated(market, deal, 4);
  const off = discountPercent(deal.price, deal.referencePrice);
  const info = getMarket(market);

  const goHref = (placement: string) =>
    `/${market}/go/${deal.id}?source=product&placement=${placement}&action=view_deal`;

  /* Same Product markup the live site publishes, so the redesign keeps its
     rich results when it takes over the URLs. */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    category: category?.name ?? deal.category,
    ...(deal.brand ? { brand: { "@type": "Brand", name: deal.brand } } : {}),
    ...(deal.image ? { image: deal.images.length ? deal.images : [deal.image] } : {}),
    ...(deal.rating > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: deal.rating,
            reviewCount: deal.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: deal.currency,
      price: deal.price,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: retailerLabel(deal.retailer) },
    },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label={t(language, "app.list.breadcrumb")} className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
          <li>
            <Link href={`/${market}`} className="hover:text-fg">
              {t(language, "page.home")}
            </Link>
          </li>
          <li aria-hidden="true">
            <CaretRight size={13} weight="bold" className="text-fg-subtle" />
          </li>
          <li>
            <Link
              href={`/${market}/category/${deal.category}`}
              className="hover:text-fg"
            >
              {localCategory}
            </Link>
          </li>
          <li aria-hidden="true">
            <CaretRight size={13} weight="bold" className="text-fg-subtle" />
          </li>
          <li aria-current="page" className="max-w-full truncate font-medium text-fg">
            {deal.title}
          </li>
        </ol>
      </nav>

      {/* ------------------------------------------------------------- top */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <DealGallery
          images={deal.images}
          alt={deal.title}
          categoryIcon={category?.icon ?? "Package"}
        />

        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="muted">
                {localCategory} ·{" "}
                {retailerLabel(deal.retailer)}
              </Pill>
              {deal.rank === 1 && <Pill tone="solid">Today&apos;s #1 pick</Pill>}
              {off !== null && <Pill tone="accent">{off}% below reference</Pill>}
            </div>

            <h1 className="mt-4 text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl lg:text-4xl">
              {deal.title}
            </h1>
            {deal.brand && (
              <p className="mt-2 text-sm text-fg-muted">
                {t(language, "product.brand")}: {deal.brand}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-card border border-border bg-surface p-5">
            {deal.score !== null && <ScoreRing score={deal.score} language={language} size={92} />}
            <div className="space-y-2">
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                  {t(language, "product.productRating")}
                </p>
                <Rating value={deal.rating} count={deal.reviewCount} language={language} />
              </div>
              {deal.seller.ratingsCount > 0 && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                    {t(language, "product.sellerRating")}
                  </p>
                  <p className="text-sm font-semibold text-fg tnum">
                    {deal.seller.positivePct.toFixed(1)}% positive
                  </p>
                </div>
              )}
            </div>
          </div>

          <PriceBlock
            price={deal.price}
            referencePrice={deal.referencePrice}
            currency={deal.currency}
            market={market}
            language={language}
            size="lg"
          />

          <TrustSignals deal={deal} language={language} />

          <div className="flex flex-col gap-3 sm:flex-row">
            <a
              href={goHref("product_cta")}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface-inverse px-6 text-base font-semibold text-fg-on-inverse transition-opacity hover:opacity-88 active:scale-[0.98]"
            >
              View deal at {retailerLabel(deal.retailer)}
              <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
            </a>
            <DeliaTrigger
              variant="inline"
              label="Ask Delia about this"
              seed={`Is ${deal.title} a good price?`}
              className="h-14 px-6 text-base"
            />
          </div>

          <p className="text-xs text-fg-subtle tnum">
            Price checked {formatDateTime(deal.checkedAt, market)}. Check the current
            price and availability on the retailer&apos;s website.{" "}
            {info?.country ?? "local"} terms apply at checkout.
          </p>
        </div>
      </div>

      {/* --------------------------------------------------- buying brief */}
      <section aria-labelledby="brief-title" className="mt-20">
        <SectionHeader
          id="brief-title"
          eyebrow="OneDailyDrop buying brief"
          title="The useful details, without the sales-page noise"
        />

        <p className="mb-6 flex items-start gap-2 text-sm text-fg-muted">
          <Check
            size={16}
            weight="bold"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-lime-deep"
          />
          This brief uses verified listing data and OneDailyDrop calculations.
          Unknown specifications are not filled in or guessed.
        </p>

        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Current price", formatPrice(deal.price, deal.currency, market)],
            ["Retailer", retailerLabel(deal.retailer)],
            ["Sold by", deal.seller.name],
            ...(deal.priceHistory.length > 0
              ? ([
                  ["30-day tracked low", formatPrice(deal.lows.d30, deal.currency, market)],
                  ["90-day tracked low", formatPrice(deal.lows.d90, deal.currency, market)],
                  [
                    "All-time tracked low",
                    formatPrice(deal.lows.allTime, deal.currency, market),
                  ],
                ] as const)
              : []),
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-tile border border-border bg-surface p-5"
            >
              <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                {label}
              </dt>
              <dd className="mt-1.5 wrap-anywhere text-lg font-bold text-fg tnum">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {(deal.strengths.length > 0 || deal.watchOuts.length > 0) && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {deal.strengths.length > 0 && (
              <div className="rounded-card border border-border bg-surface p-6">
                <h3 className="flex items-center gap-2 text-base font-bold text-fg">
                  <Check
                    size={18}
                    weight="bold"
                    aria-hidden="true"
                    className="text-lime-deep"
                  />
                  {t(language, "app.deal.verifiedStrengths")}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {deal.strengths.map((s) => (
                    <li key={s} className="flex gap-2.5 text-sm text-fg-muted">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-lime-deep" />
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {deal.watchOuts.length > 0 && (
              <div className="rounded-card border border-border bg-surface p-6">
                <h3 className="flex items-center gap-2 text-base font-bold text-fg">
                  <Warning
                    size={18}
                    weight="bold"
                    aria-hidden="true"
                    className="text-warning"
                  />
                  {t(language, "assistant.drawbacks")}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {deal.watchOuts.map((w) => (
                    <li key={w} className="flex gap-2.5 text-sm text-fg-muted">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-warning" />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {(deal.whyWePicked.length > 0 || deal.score !== null) && (
          <div className="mt-6 rounded-card border border-border bg-surface p-6">
            <h3 className="text-base font-bold text-fg">{t(language, "app.deal.whyItMadeTheList")}</h3>
            <ul className="mt-4 space-y-2.5">
              {deal.whyWePicked.map((r) => (
                <li key={r} className="flex gap-2.5 text-sm text-fg-muted">
                  <Check
                    size={15}
                    weight="bold"
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-lime-deep"
                  />
                  {r}
                </li>
              ))}
            </ul>
            {deal.score !== null && (
              <p className="mt-5 border-t border-border pt-5 text-sm leading-relaxed text-fg-muted">
                The OneDailyDrop Score is {deal.score}/100 and measures the offer
                as a whole: price value, product evidence, review confidence,
                seller reliability and buying terms. Affiliate commission does
                not add points and does not determine which item becomes the
                Daily Drop.
              </p>
            )}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- price history */}
      <section aria-labelledby="history-title" className="mt-20">
        <SectionHeader id="history-title" eyebrow="Tracked" title="Price history" />
        <PriceHistory
          history={deal.priceHistory}
          currency={deal.currency}
          market={market}
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href={goHref("price_history_cta")}
            target="_blank"
            rel="sponsored noopener noreferrer"
            className="inline-flex h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 active:scale-[0.98]"
          >
            Check current price at {retailerLabel(deal.retailer)}
            <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
          </a>
          <p className="text-sm text-fg-muted">
            The retailer is always the final source for price, condition and
            total at checkout.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- related */}
      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-20">
          <SectionHeader
            id="related-title"
            eyebrow="Also checked"
            title="Related picks"
            action={{
              href: `/${market}/category/${deal.category}`,
              label: `${t(language, "app.list.allDeals")} · ${localCategory}`,
            }}
          />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r, i) => (
              <li key={r.id}>
                <DealCard deal={r} market={market} index={i} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DeliaTrigger variant="floating" />
    </div>
  );
}
