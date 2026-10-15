import Link from "next/link";
import { ArrowUpRight, CaretRight } from "@phosphor-icons/react/ssr";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatPrice } from "@/lib/format";
import { categoryName, getLanguage, t } from "@/lib/i18n";
import { getCategory } from "@/lib/catalog";
import type { EndedDeal } from "@/lib/catalog";

/*
 * The page a listing becomes once it has left the catalogue.
 *
 * It used to be a 404. That is the correct answer for a shop and the wrong one
 * here: a pin lives six months to a year, a guide links out for longer, and
 * the visitor arriving at the end of one did not come to be told the address
 * is wrong — they came looking for a thing of this kind, and we still have
 * those.
 *
 * It says plainly that this particular offer is over, which is the honest
 * thing and also the useful one: a page that quietly redirects somewhere else
 * leaves the reader wondering whether they misremembered the price.
 *
 * Deliberately not indexed. A page whose content is "this is gone" has nothing
 * to rank for, and a site that accumulates them teaches a crawler to expect
 * thin pages. It stays reachable by link, which is the entire point.
 */
export async function OfferEnded({ market, deal }: { market: string; deal: EndedDeal }) {
  const language = await getLanguage(market);
  const category = getCategory(deal.category);
  const localCategory = category ? categoryName(category.name, language) : deal.category;
  const checked = deal.lastCheckedAt
    ? new Date(deal.lastCheckedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
      <nav aria-label={t(language, "app.list.breadcrumb")} className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
          <li>
            <Link href={`/${market}`} className="hover:text-fg">
              {t(language, "page.home")}
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden="true">
                <CaretRight size={13} weight="bold" className="text-fg-subtle" />
              </li>
              <li>
                <Link href={`/${market}/category/${category.slug}`} className="hover:text-fg">
                  {localCategory}
                </Link>
              </li>
            </>
          )}
        </ol>
      </nav>

      <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-fg-subtle">
          This offer has ended
        </p>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start">
          {deal.image && (
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-white">
              <ProductImage
                src={deal.image}
                alt={deal.title}
                categoryIcon={category?.icon ?? "Package"}
                sizes="112px"
                className="p-2 opacity-60 grayscale"
              />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-snug text-fg sm:text-2xl">{deal.title}</h1>
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-fg-muted">
              {deal.retailer
                ? `${deal.retailer} no longer lists this, or the listing stopped being available.`
                : "This listing is no longer available."}{" "}
              {checked
                ? `We last confirmed its price on ${checked}, and we do not keep showing a price we cannot check.`
                : "We do not keep showing a price we cannot check."}
            </p>
          </div>
        </div>
      </div>

      {deal.alternatives.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-fg">
            {localCategory ? `Current ${localCategory.toLowerCase()} picks` : "What we have now"}
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Checked today, with the price evidence on each one.
          </p>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {deal.alternatives.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group flex gap-4 rounded-card border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white">
                    <ProductImage
                      src={item.image}
                      alt={item.title}
                      categoryIcon={category?.icon ?? "Package"}
                      sizes="80px"
                      className="p-2"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-fg">{item.title}</p>
                    <p className="mt-1.5 text-base font-bold text-fg tnum">
                      {formatPrice(item.price, item.currency)}
                    </p>
                    {item.score != null && (
                      <p className="mt-1 text-xs text-fg-muted tnum">Score {Math.round(item.score)}/100</p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        {category && (
          <Link
            href={`/${market}/category/${category.slug}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white"
          >
            All {localCategory.toLowerCase()}
            <ArrowUpRight size={15} weight="bold" />
          </Link>
        )}
        <Link
          href={`/${market}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-fg"
        >
          {t(language, "page.home")}
        </Link>
      </div>
    </div>
  );
}
