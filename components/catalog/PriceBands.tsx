"use client";

import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { PriceBucket } from "@/lib/filter";
import type { DealFilter } from "@/lib/types";
import { useCopy } from "@/components/site/CopyProvider";

/**
 * Price as four bands, not two handles.
 *
 * What stood here was a slider with two grips and, beneath it, two number
 * fields doing exactly the same job — one control's worth of work in two
 * controls' worth of column. It also appeared on every listing, including the
 * fifteen categories of seventeen whose entire contents fit on a page or two,
 * where filtering by price saves nobody a single action. Dragging a grip on a
 * phone is the worst of it.
 *
 * The bands come from the shelf itself (priceBuckets in lib/filter.ts), so
 * mattresses and phone cases get different numbers, and each one says how many
 * listings it holds. One tap, and the band that holds nothing is not drawn.
 */
export function PriceBands({
  filter,
  buckets,
  currency,
  market,
  onApply,
}: {
  filter: DealFilter;
  buckets: PriceBucket[];
  currency: string;
  market: string;
  onApply: (patch: Partial<DealFilter>) => void;
}) {
  const tr = useCopy();
  if (!buckets.length) return null;

  const chosen = (bucket: PriceBucket) =>
    (filter.minPrice ?? 0) === bucket.min && filter.maxPrice === bucket.max;

  const label = (bucket: PriceBucket) => {
    const from = formatPrice(bucket.min, currency, market);
    const to = bucket.max === undefined ? "" : formatPrice(bucket.max, currency, market);
    if (!bucket.min) return tr("app.filter.under", { price: to });
    if (bucket.max === undefined) return tr("app.filter.over", { price: from });
    return `${from} – ${to}`;
  };

  return (
    <fieldset>
      <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
        {tr("app.filter.priceRange")}
      </legend>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter.minPrice === undefined && filter.maxPrice === undefined}
          onClick={() => onApply({ minPrice: undefined, maxPrice: undefined })}
          className={cn(
            "inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium transition-colors",
            filter.minPrice === undefined && filter.maxPrice === undefined
              ? "bg-surface-inverse text-fg-on-inverse"
              : "border border-border text-fg-muted hover:border-border-strong hover:text-fg",
          )}
        >
          {tr("app.filter.any")}
        </button>
        {buckets.map((bucket) => (
          <button
            key={`${bucket.min}-${bucket.max ?? "up"}`}
            type="button"
            aria-pressed={chosen(bucket)}
            onClick={() =>
              onApply(
                chosen(bucket)
                  ? { minPrice: undefined, maxPrice: undefined }
                  : { minPrice: bucket.min || undefined, maxPrice: bucket.max },
              )
            }
            className={cn(
              "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              chosen(bucket)
                ? "bg-surface-inverse text-fg-on-inverse"
                : "border border-border text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            <span>{label(bucket)}</span>
            <span className="text-xs tabular-nums opacity-60">{bucket.count}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
