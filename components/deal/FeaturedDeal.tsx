import Link from "next/link";
import { ArrowUpRight, Check } from "@phosphor-icons/react/ssr";
import { getCategory } from "@/lib/catalog";
import { categoryName, getLanguage, t } from "@/lib/i18n";
import { formatDateTime, retailerLabel } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { ProductImage } from "@/components/ui/ProductImage";
import { Rating } from "@/components/ui/Rating";
import { Pill } from "@/components/ui/Pill";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { PriceBlock } from "./PriceBlock";
import { ScoreRing } from "./ScoreRing";
import { TrustSignals } from "./TrustSignals";

/**
 * Today's drop, given the space it deserves — this single card is the reason
 * the site exists, so it carries the full argument: score, price evidence, why
 * it was picked, and who it ships from.
 */
export async function FeaturedDeal({
  deal,
  market,
}: {
  deal: Deal;
  market: string;
}) {
  const category = getCategory(deal.category);
  const language = await getLanguage(market);

  return (
    <article className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="grid lg:grid-cols-2">
        <div className="relative aspect-[4/3] bg-white lg:aspect-auto lg:min-h-[440px]">
          <ProductImage
            src={deal.image}
            alt={deal.title}
            categoryIcon={category?.icon ?? "Package"}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
            className="p-8"
          />
          <div className="absolute left-5 top-5 flex flex-wrap gap-2">
            <Pill tone="solid">Today&apos;s #1 pick</Pill>
            {deal.seller.positivePct >= 98 && (
              <Pill tone="accent">{t(language, "product.establishedSeller")}</Pill>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                {category ? categoryName(category.name, language) : deal.category} ·{" "}
                {retailerLabel(deal.retailer)}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-tight tracking-tight text-fg sm:text-2xl">
                {deal.title}
              </h3>
            </div>
            {deal.score !== null && <ScoreRing score={deal.score} language={language} size={82} />}
          </div>

          <Rating value={deal.rating} count={deal.reviewCount} language={language} />

          <PriceBlock
            price={deal.price}
            referencePrice={deal.referencePrice}
            currency={deal.currency}
            market={market}
            language={language}
            size="lg"
          />

          {deal.whyWePicked.length > 0 && (
            <div>
              <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                {t(language, "page.whyPicked")}
              </h4>
              <ul className="mt-2.5 space-y-1.5">
                {deal.whyWePicked.slice(0, 4).map((reason) => (
                  <li key={reason} className="flex gap-2 text-sm text-fg-muted">
                    <Check
                      size={16}
                      weight="bold"
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-lime-deep"
                    />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TrustSignals deal={deal} language={language} />

          <div className="mt-auto flex flex-col gap-3 pt-2 sm:flex-row">
            <a
              href={`/${market}/go/${deal.id}?source=home&placement=featured_cta&action=view_deal`}
              target="_blank"
              rel="sponsored noopener noreferrer"
              className="inline-flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-surface-inverse px-6 text-base font-semibold text-fg-on-inverse transition-opacity hover:opacity-88 active:scale-[0.98]"
            >
              View deal at {retailerLabel(deal.retailer)}
              <ArrowUpRight size={18} weight="bold" aria-hidden="true" />
            </a>
            <Link
              href={`/${market}/deal/${deal.id}`}
              className="inline-flex h-14 cursor-pointer items-center justify-center rounded-full border border-border-strong px-6 text-base font-semibold text-fg transition-colors hover:bg-surface-2"
            >
              {t(language, "app.deal.fullBreakdown")}
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg-subtle tnum">
              Price checked {formatDateTime(deal.checkedAt, market)}
            </p>
            <DeliaTrigger
              variant="inline"
              label={t(language, "app.deal.askAboutThis")}
              seed={`Is ${deal.title} a good price?`}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
