import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/ssr";
import {
  getCategoriesWithCounts,
  getMarket,
  getTopPicks,
} from "@/lib/catalog";
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
  const country = info?.country ?? "your market";
  return {
    title: `Checked deals in ${country}`,
    description: `Check here before you buy. We compare price signal, product rating and seller confidence across ${country} retailers, and only list what clears the bar.`,
    alternates: { canonical: `/${market}` },
  };
}

export default async function MarketHome({ params }: PageProps<"/[market]">) {
  const { market } = await params;
  const info = getMarket(market);

  /* The homepage is the catalog now, not the daily drop: it leads with search
     and the best-scoring picks. The drop still runs on its own schedule and
     lives at /[market]/daily-drop — one feature here, not the whole product. */
  const picks = await getTopPicks(market, 12);
  const categories = await getCategoriesWithCounts(market);

  /* Honest empty state rather than a crash — no sample prices or products are
     invented while the catalog for this market is empty (a source outage, or
     before the first refresh has ever run). */
  if (!picks.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {info?.country ?? "Your market"}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Checking today&apos;s picks
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          We haven&apos;t published checked deals for this market yet. No sample
          prices or products are shown while we verify the catalog — check back
          shortly.
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
            Every listing in {info?.country ?? "your market"}, checked before it
            is shown
          </p>
          <h1
            id="hero-title"
            className="mt-4 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
          >
            Check here before you buy.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
            We compare local prices, product quality and seller signals, so your
            first stop before buying is a smarter one.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/${market}/search`}
              className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 active:scale-[0.98]"
            >
              Browse checked deals
              <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
            <Link
              href={`/${market}/how-we-select-deals`}
              className="inline-flex h-14 cursor-pointer items-center rounded-full border border-white/30 px-7 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              How we select
            </Link>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {["Price signal", "Product quality", "Seller confidence"].map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <ShieldCheck size={16} weight="fill" aria-hidden="true" className="text-lime" />
                {s}
              </li>
            ))}
          </ul>
        </div>

        {/* Delia sits on the seam of the two blocks: in flow between them on
            narrow screens, centred over both from lg up. */}
        <div className="relative z-20 -my-7 flex justify-center lg:pointer-events-none lg:absolute lg:inset-0 lg:my-0 lg:items-center">
          <div className="pointer-events-auto flex flex-col items-center">
            <DeliaTrigger variant="hero" />
            <p className="mt-3 hidden max-w-[13rem] text-center text-xs font-medium text-fg-muted lg:block">
              Say what you need. Delia searches only the checked picks.
            </p>
          </div>
        </div>

        {/* The drop keeps a door on the homepage rather than the homepage. */}
        <div className="flex flex-col justify-between gap-8 rounded-card bg-lime p-7 sm:p-10">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-ink/60">
              Also here
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-ink">
              Daily Drop
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/75">
              One pick a day, put through the same checks. A new one lands every
              day at midnight UTC.
            </p>
            <Link
              href={`/${market}/daily-drop`}
              className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              See the Daily Drop
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <p className="text-sm font-medium leading-relaxed text-ink/80">
            OneDailyDrop does not sell products. When you choose a deal, we send
            you to the local retailer.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- categories */}
      <section aria-labelledby="categories-title" className="mt-20">
        <SectionHeader
          id="categories-title"
          eyebrow="Browse"
          title="Explore categories"
          action={{ href: `/${market}/search`, label: "See all deals" }}
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
                  {c.count} checked
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
          eyebrow="Highest scoring"
          title="Best right now"
          action={{ href: `/${market}/search`, label: "See all deals" }}
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
      <section className="mt-20">
        <InterestSignup categories={categories} market={market} />
      </section>

      {/* Follows the visitor down the page once the hero button scrolls away. */}
      <DeliaTrigger variant="floating" className="lg:hidden" />
    </div>
  );
}
