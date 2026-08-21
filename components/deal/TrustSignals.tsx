import {
  ArrowUUpLeft,
  Package,
  Storefront,
  Truck,
} from "@phosphor-icons/react/ssr";
import { formatCount, formatPositive } from "@/lib/format";
import type { Deal } from "@/lib/types";
import { t } from "@/lib/i18n";

/**
 * Seller, delivery, returns and stock — the four things the site checks before
 * it will recommend a listing. Each pairs an icon with a written label so the
 * meaning never rests on the glyph.
 *
 * `language` is required, not defaulted: these four labels sit directly beside
 * translated copy, and an English "Sold by" under a Spanish heading is the exact
 * failure this file had.
 */
export function TrustSignals({ deal, language }: { deal: Deal; language: string }) {
  const rows = [
    {
      icon: Storefront,
      label: t(language, "product.soldBy"),
      value: `${deal.seller.name}${
        deal.seller.ratingsCount > 0
          ? ` · ${t(language, "app.card.sellerPositive", {
              percent: formatPositive(deal.seller.positivePct),
              count: formatCount(deal.seller.ratingsCount),
            })}`
          : ""
      }`,
    },
    { icon: Truck, label: t(language, "product.delivery"), value: deal.delivery },
    { icon: ArrowUUpLeft, label: t(language, "product.returns"), value: deal.returns },
    { icon: Package, label: t(language, "page.availability"), value: deal.availability },
  ];

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {rows.map(({ icon: Icon, label, value }) => (
        <div key={label} className="flex gap-3">
          <Icon
            size={18}
            weight="bold"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-fg-subtle"
          />
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {label}
            </dt>
            <dd className="mt-0.5 wrap-anywhere text-sm text-fg">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
