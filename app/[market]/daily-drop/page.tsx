import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/ssr";
import { getMarket, getTodaysDrop } from "@/lib/catalog";
import { countryName, getLanguage, t } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import { NextDropCountdown } from "@/components/site/NextDropCountdown";
import { SectionHeader } from "@/components/site/SectionHeader";
import { FeaturedDeal } from "@/components/deal/FeaturedDeal";

/**
 * The Daily Drop lives here rather than on the homepage.
 *
 * The selection itself is unchanged — the backend still publishes one ranked
 * pick per market per day. What changed is its billing: the homepage is the
 * catalog, and the drop is one feature within it instead of the whole product.
 *
 * The params type is written out rather than using the generated `PageProps`
 * helper so this route compiles on a clean checkout, before the route types
 * for a brand-new segment have been emitted.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ market: string }>;
}): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    title: t(language, "app.drop.title"),
    description: t(language, "app.drop.metaDescription", { country }),
    alternates: { canonical: `/${market}/daily-drop` },
  };
}

export default async function DailyDropPage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  const drop = await getTodaysDrop(market);

  /* Honest empty state rather than a crash — no sample prices or products are
     invented while the catalog for this market is empty (a source outage, or
     before the first refresh has ever run). */
  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {country}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {t(language, "app.drop.emptyTitle")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          {t(language, "app.drop.emptyText")}
        </p>
        <Link
          href={`/${market}/search`}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
        >
          {t(language, "app.home.browse")}
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <section
        aria-labelledby="drop-hero-title"
        className="grid gap-4 lg:grid-cols-[1.35fr_1fr]"
      >
        <div className="rounded-card bg-graphite p-7 text-white sm:p-10 lg:p-12">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/60">
            {t(language, "app.drop.eyebrow", { country })}
          </p>
          <h1
            id="drop-hero-title"
            className="mt-4 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl"
          >
            {t(language, "app.drop.title")}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
            {t(language, "app.drop.lede")}
          </p>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {["app.signal.price", "app.signal.quality", "app.signal.seller"].map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <ShieldCheck
                  size={16}
                  weight="fill"
                  aria-hidden="true"
                  className="text-lime"
                />
                {t(language, key)}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-between gap-8 rounded-card bg-lime p-7 sm:p-10">
          <div>
            <NextDropCountdown />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/75">
              {t(language, "app.drop.landsDaily", {
                checkedAt: formatDateTime(drop.checkedAt, market),
              })}
            </p>
          </div>

          <Link
            href={`/${market}/archive`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink underline-offset-4 hover:underline"
          >
            {t(language, "app.drop.pastDrops")}
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="drop-title" className="mt-20">
        <SectionHeader
          id="drop-title"
          eyebrow={t(language, "app.drop.checkedToday")}
          title={t(language, "app.drop.todaysPick")}
        />
        <FeaturedDeal deal={drop} market={market} />
      </section>
    </div>
  );
}
