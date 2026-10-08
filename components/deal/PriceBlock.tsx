import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import { displayDiscount } from "@/lib/pricing";
import type { PricePoint, Deal } from "@/lib/types";
import { t } from "@/lib/i18n";

/**
 * Current price, with the reference price and saving shown only when a
 * reference has actually been verified. A struck-through number that nobody
 * checked is the oldest trick in retail, and this site's whole proposition is
 * that it does not play it.
 */
export function PriceBlock({
  price,
  referencePrice,
  currency = "USD",
  market,
  language,
  size = "md",
  className,
  history = [],
  coupons = [],
}: {
  price: number;
  coupons?: Deal["coupons"];
  referencePrice: number | null;
  currency?: string;
  market?: string;
  language: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /* What we recorded ourselves, where the caller has it: the only independent
     support an extraordinary saving can have. */
  history?: PricePoint[];
}) {
  const off = displayDiscount(price, referencePrice, history);

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

      {off !== null && referencePrice !== null && (
        <>
          <span className="text-sm text-fg-subtle line-through tnum">
            {formatPrice(referencePrice, currency, market)}
          </span>
          <span className="inline-flex items-center rounded-full bg-lime px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink">
            {t(language, "app.card.percentBelowRef", { percent: off })}
          </span>
        </>
      )}
      {coupons.map(coupon => <div key={coupon.code} className="w-full text-sm leading-relaxed text-fg-muted">
        <span className="font-semibold text-fg">{t(language, "app.coupon.code")}: <code>{coupon.code}</code></span>
        {coupon.message && <span className="block">{coupon.message}</span>}
        <a href={coupon.termsUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{t(language, "app.coupon.terms")}</a>
      </div>)}
    </div>
  );
}
