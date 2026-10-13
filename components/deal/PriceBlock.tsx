import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { trackedSaving } from "@/lib/pricing";
import type { Deal } from "@/lib/types";
import { t } from "@/lib/i18n";

/**
 * Current price, the seller's reference beside it, and a percentage only where
 * we measured the fall ourselves.
 *
 * The green pill used to read "50% below seller's list" — our pill, our
 * colour, our arithmetic, performed on a number the seller typed. A
 * struck-through figure nobody checked is the oldest trick in retail, and this
 * site's whole proposition is that it does not play it. The figure stays,
 * because a shopper wants to see it, but it is labelled as the seller's and
 * carries no percentage. The pill is reserved for the drop we recorded.
 */
export function PriceBlock({
  price,
  referencePrice,
  trackedDropPercent = 0,
  currency = "USD",
  market,
  language,
  size = "md",
  className,
  coupons = [],
}: {
  price: number;
  coupons?: Deal["coupons"];
  referencePrice: number | null;
  /* What our own tracking recorded. Zero for a price that has not moved, which
     is most of them. */
  trackedDropPercent?: number;
  currency?: string;
  market?: string;
  language: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dropped = trackedSaving(trackedDropPercent);

  const priceSize = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl sm:text-5xl",
  }[size];

  return (
    <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)}>
      <span className={cn("font-bold tracking-tight text-fg tnum", priceSize)}>
        {formatPrice(price, currency, market)}
      </span>

      {referencePrice !== null && referencePrice > price && (
        <span className="text-sm text-fg-subtle tnum">
          <span className="line-through">{formatPrice(referencePrice, currency, market)}</span>{" "}
          <span className="not-italic">{t(language, "app.price.sellerList")}</span>
        </span>
      )}

      {dropped !== null && (
        <span
          className="inline-flex items-center rounded-full bg-lime px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink"
          title={t(language, "app.card.trackedDrop", { percent: dropped })}
        >
          {t(language, "app.card.trackedDropShort", { percent: dropped })}
        </span>
      )}

      {coupons.map(coupon => <div key={coupon.code} className="w-full text-sm leading-relaxed text-fg-muted">
        <span className="font-semibold text-fg">{t(language, "app.coupon.code")}: <code>{coupon.code}</code></span>
        {coupon.message && <span className="block">{coupon.message}</span>}
        <a href={coupon.termsUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t(language, "app.coupon.terms")}</a>
      </div>)}
    </div>
  );
}
