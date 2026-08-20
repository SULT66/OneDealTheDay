import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "@phosphor-icons/react/ssr";
import { getMarket, getTodaysDrop } from "@/lib/catalog";
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
  const country = info?.country ?? "your market";
  return {
    title: "Daily Drop",
    description: `One checked pick a day in ${country}, chosen on price signal, product rating and seller confidence.`,
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
  const drop = await getTodaysDrop(market);

  /* Honest empty state rather than a crash — no sample prices or products are
     invented while the catalog for this market is empty (a source outage, or
     before the first refresh has ever run). */
  if (!drop) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
          {info?.country ?? "Your market"}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          No drop published yet
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          We haven&apos;t published a checked pick for this market yet. No
          sample prices or products are shown while we verify the catalog.
        </p>
        <Link
          href={`/${market}/search`}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
        >
          Browse checked deals
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
            One genuinely good deal in {info?.country ?? "your market"}, checked
            daily
          </p>
          <h1
            id="drop-hero-title"
            className="mt-4 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl"
          >
            Daily Drop
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
            One pick a day, put through the same three checks as everything else
            in the catalog. If nothing clears the bar, we say so rather than
            filling the slot.
          </p>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
            {["Price signal", "Product quality", "Seller confidence"].map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <ShieldCheck
                  size={16}
                  weight="fill"
                  aria-hidden="true"
                  className="text-lime"
                />
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-between gap-8 rounded-card bg-lime p-7 sm:p-10">
          <div>
            <NextDropCountdown />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink/75">
              A new pick lands every day at midnight UTC. Today&apos;s was
              checked {formatDateTime(drop.checkedAt, market)}.
            </p>
          </div>

          <Link
            href={`/${market}/archive`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink underline-offset-4 hover:underline"
          >
            See past drops
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="drop-title" className="mt-20">
        <SectionHeader
          id="drop-title"
          eyebrow="Checked today"
          title="Today's pick"
        />
        <FeaturedDeal deal={drop} market={market} />
      </section>
    </div>
  );
}
