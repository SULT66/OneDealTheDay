import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/ssr";
import {
  getCategoriesWithCounts,
  getMarket,
  getTopPicks,
} from "@/lib/catalog";
import { countryName, getLanguage, t } from "@/lib/i18n";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SectionHeader } from "@/components/site/SectionHeader";
import { InterestSignup } from "@/components/site/InterestSignup";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { DealCard } from "@/components/deal/DealCard";

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
      absolute: `OneDailyDrop: ${t(language, "app.home.metaTitle", { country })}`,
    },
    description: t(language, "app.home.metaDescription", { country }),
    alternates: { canonical: `/${market}` },
  };
}

export default async function MarketHome({ params }: PageProps<"/[market]">) {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");

  /* The homepage is the catalog now, not the daily drop: it leads with search
     and the best-scoring picks. The drop still runs on its own schedule and
     lives at /[market]/daily-drop — one feature here, not the whole product. */
  const picks = await getTopPicks(market, 12);
  const categories = await getCategoriesWithCounts(market, language);

  /* Honest empty state rather than a crash — no sample prices or products are
     invented while the catalog for this market is empty (a source outage, or
     before the first refresh has ever run). */
  if (!picks.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {country}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {t(language, "app.home.emptyTitle")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          {t(language, "app.home.emptyText")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      {/* ---------------------------------------------------------------- hero */}
      <section
        aria-labelledby="hero-title"
        className="relative grid gap-4 lg:grid-cols-[1.35fr_1fr]"
      >
        <div className="rounded-card bg-graphite p-7 text-white sm:p-10 lg:p-12">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/60">
            {t(language, "app.home.eyebrow", { country })}
          </p>
          <h1
            id="hero-title"
            className="mt-4 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            {t(language, "app.home.title")}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
            {t(language, "app.home.lede")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/${market}/search`}
              className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 active:scale-[0.98]"
            >
              {t(language, "app.home.browse")}
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
            <Link
              href={`/${market}/how-we-select-deals`}
              className="inline-flex h-14 cursor-pointer items-center rounded-full border border-white/30 px-7 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              {t(language, "app.home.howWeSelect")}
            </Link>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {["app.signal.price", "app.signal.quality", "app.signal.seller"].map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <ShieldCheck size={16} weight="fill" aria-hidden="true" className="text-lime" />
                {t(language, key)}
              </li>
            ))}
          </ul>
        </div>

        {/* The drop keeps a door on the homepage rather than the homepage. */}
        <div className="flex flex-col justify-between gap-8 rounded-card bg-lime p-7 sm:p-10">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink/60">
              {t(language, "app.home.alsoHere")}
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink">
              {t(language, "app.drop.title")}
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/75">
              {t(language, "app.home.dropTeaser")}
            </p>
            <Link
              href={`/${market}/daily-drop`}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              {t(language, "app.home.seeDrop")}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <p className="text-sm font-medium leading-relaxed text-ink/80">
            {t(language, "app.notSeller")}
          </p>
        </div>
      </section>

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
      {/* scroll-mt clears the sticky header when a visitor arrives via the
          header's CTA — on this page that's a same-page jump straight to
          #subscribe, on any other page it's a normal navigation that lands
          here already scrolled into view. */}
      <section id="subscribe" className="mt-20 scroll-mt-32">
        <InterestSignup categories={categories} market={market} />
      </section>

      {/* Follows the visitor down every page now — the large hero circle that
          used to sit on the seam between the two hero cards read as a stray
          floating button, so desktop leans on this and the header pill
          instead, same as every other page. */}
      <DeliaTrigger variant="floating" />
    </div>
  );
}
