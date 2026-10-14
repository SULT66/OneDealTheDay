import Link from "next/link";
import type React from "react";
import { getCategory } from "@/lib/catalog";
import { categoryName, getLanguage, t } from "@/lib/i18n";
import { retailerLabel } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ProductImage } from "@/components/ui/ProductImage";
import { Rating } from "@/components/ui/Rating";
import { PriceBlock } from "./PriceBlock";

/**
 * Grid card. The whole card is one link — the score, price and rating are
 * evidence inside it rather than separate controls — which keeps a single tap
 * target per card and avoids nested interactive elements.
 *
 * Async so it can resolve the visitor's language itself. Threading it down as a
 * prop from six call sites is the version where one of them gets forgotten and
 * a grid of English cards appears under a Spanish heading — which is precisely
 * what shipped. `headers()` is memoized per request, so reading it once per
 * card costs nothing.
 */
export async function DealCard({
  deal,
  market,
  index = 0,
  priority = false,
  unavailable = false,
  tracking,
  campaignBadge,
}: {
  deal: Deal;
  market: string;
  /** Renders the card without a link. Used by the archive for picks whose
      product has since been archived: /deal/:id and /go/:id both require a
      published product, so linking one is a guaranteed 404. */
  unavailable?: boolean;
  /** Position in the grid, used to stagger the entrance. */
  index?: number;
  priority?: boolean;
  tracking?: { source: "home" | "category"; placement: "seasonal_card" | "trend_card" };
  campaignBadge?: string;
}) {
  const category = getCategory(deal.category);
  const language = await getLanguage(market);
  /* A card carries no price history, so a saving too large to take on the
     seller's word alone is not claimed here. See lib/pricing.ts. */
  /* A plain <div> when there is nowhere safe to send the visitor. */
  const Body = (unavailable ? "div" : Link) as React.ElementType;

  return (
    <article
      className="rise-in h-full"
      style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
    >
      <Body
        {...(unavailable ? {} : { href: `/${market}/deal/${deal.id}` })}
        {...(!unavailable && tracking ? {
          "data-merch-product": deal.id,
          "data-merch-source": tracking.source,
          "data-merch-placement": tracking.placement,
        } : {})}
        className={cn(
          "group flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface",
          campaignBadge && "border-red-200 shadow-sm",
          unavailable
            ? "opacity-60"
            : "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lift",
        )}
      >
        <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-white">
          <ProductImage
            src={deal.thumbnail || deal.image}
            alt={deal.title}
            categoryIcon={category?.icon ?? "Package"}
            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 300px"
            priority={priority}
            className="p-4 transition-transform duration-300 group-hover:scale-[1.04]"
          />

          {/* The position in the list being read, not the item's place in the
              whole catalogue.

              It used to show deal.rank, a catalogue position, and on a curated
              grid that produced #1, #2, #3, #4, #125, #126 … #137. A reviewer
              seeing that reasonably concluded the ranking was broken. A number
              beside the fifth card can only sensibly mean "the fifth of
              these". */}
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-ink/85 px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-white tnum">
            #{index + 1}
          </span>
          {campaignBadge && <span className="absolute right-3 top-3 rounded-full bg-red-600 px-3 py-1.5 text-[0.65rem] font-extrabold uppercase tracking-wider text-white shadow-sm">
            {campaignBadge}
          </span>}

          {/*
           * Nothing else in this corner.
           *
           * It held "42% OFF LIST" while the price block said "42% BELOW
           * SELLER'S LIST" from the same number — one claim, printed twice, and
           * up here with nothing beside it to be 42% of. The corner was then
           * given to the drop we measured ourselves, which has since moved
           * beside the price for the same reason: a percentage belongs next to
           * the figure it is a percentage of.
           */}

        </div>

        <div className="flex flex-1 flex-col gap-2.5 p-5">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            {category ? categoryName(category.name, language) : deal.category} ·{" "}
            {retailerLabel(deal.retailer)}
          </p>

          <h3 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-fg">
            {deal.title}
          </h3>

          <Rating
            value={deal.rating}
            count={deal.reviewCount}
            language={language}
            size={14}
          />

          <div className="mt-auto flex items-end justify-between gap-3 pt-2">
            <PriceBlock
              price={deal.price}
              referencePrice={deal.referencePrice}
              trackedDropPercent={deal.trackedDropPercent}
              currency={deal.currency}
              market={market}
              language={language}
              size="sm"
            />
            {deal.score !== null && (
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-bold text-ink tnum"
                title="OneDailyDrop Score"
              >
                {deal.score}
                <span className="sr-only">
                  {t(language, "app.card.scoreOutOf", { score: deal.score })}
                </span>
              </span>
            )}
          </div>
        </div>
      </Body>
    </article>
  );
}
