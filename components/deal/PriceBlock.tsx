import { cn } from "@/lib/cn";
import { discountPercent, formatPrice } from "@/lib/format";

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
  size = "md",
  className,
}: {
  price: number;
  referencePrice: number | null;
  currency?: string;
  market?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const off = discountPercent(price, referencePrice);

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
            {off}% below ref.
          </span>
        </>
      )}
    </div>
  );
}
