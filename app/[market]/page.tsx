import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/ssr";
import {
  getCategoriesWithCounts,
  getMarket,
  getMorePicks,
  getTodaysDrop,
} from "@/lib/catalog";
import { formatDateTime } from "@/lib/format";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { SectionHeader } from "@/components/site/SectionHeader";
import { NextDropCountdown } from "@/components/site/NextDropCountdown";
import { InterestSignup } from "@/components/site/InterestSignup";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { FeaturedDeal } from "@/components/deal/FeaturedDeal";
import { DealCard } from "@/components/deal/DealCard";

export async function generateMetadata({
  params,
}: PageProps<"/[market]">): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  const country = info?.country ?? "your market";
  return {
    title: `Best daily deals in ${country}`,
    description: `One genuinely good deal in ${country}, checked daily against price, product rating and seller signals.`,
    alternates: { canonical: `/${market}` },
  };
}

export default async function MarketHome({ params }: PageProps<"/[market]">) {
  const { market } = await params;
  const info = getMarket(market);
  const drop = await getTodaysDrop(market);

  /* Honest empty state rather than a crash — no sample prices or products
     are invented while the catalog for this market is empty (a fresh source
     outage, or before the first refresh has ever run). */
  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {info?.country ?? "Your market"}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Checking today&apos;s picks
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          We haven&apos;t published a checked deal for this market yet. No
          sample prices or products are shown while we verify the catalog —
          check back shortly.
        </p>
      </div>
    );
  }

  const picks = await getMorePicks(market, 11);
  const categories = await getCategoriesWithCounts(market);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      {/* ---------------------------------------------------------------- hero */}
      <section
        aria-labelledby="hero-title"
        className="relative grid gap-4 lg:grid-cols-[1.35fr_1fr]"
      >
        <div className="rounded-card bg-graphite p-7 text-white sm:p-10 lg:p-12">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/60">
            One genuinely good deal in {info?.country ?? "your market"}, checked
            daily
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
              href={`/${market}/deal/${drop.id}`}
              className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-full bg-lime px-7 text-base font-semibold text-ink transition-opacity hover:opacity-88 active:scale-[0.98]"
            >
              See today&apos;s drop
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

        <div className="flex flex-col justify-between gap-8 rounded-card bg-lime p-7 sm:p-10">
          <div>
            <NextDropCountdown />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/75">
              A new pick lands every day at midnight UTC. Today&apos;s was
              checked {formatDateTime(drop.checkedAt, market)}.
            </p>
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

      {/* --------------------------------------------------------- today's pick */}
      <section aria-labelledby="drop-title" className="mt-20">
        <SectionHeader
          id="drop-title"
          eyebrow="Checked today"
          title="Today's #1 pick"
        />
        <FeaturedDeal deal={drop} market={market} />
      </section>

      {/* -------------------------------------------------------------- more */}
      <section aria-labelledby="more-title" className="mt-20">
        <SectionHeader
          id="more-title"
          eyebrow="More smart picks"
          title="More checked picks"
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
