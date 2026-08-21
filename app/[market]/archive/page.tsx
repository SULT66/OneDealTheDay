import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { getArchive, getMarket } from "@/lib/catalog";
import { countryName, getLanguage, t, tagFor } from "@/lib/i18n";
import { formatPrice } from "@/lib/format";
import { SectionHeader } from "@/components/site/SectionHeader";
import { DealCard } from "@/components/deal/DealCard";

/**
 * Past drops, in the current design.
 *
 * This page was the last high-traffic route still served by the old Express
 * template — reachable from the drop page and from the footer, and visibly
 * from another site once you arrived. It renders the same daily_drops rows the
 * old page did, read over /api/archive.
 *
 * A past drop is a record of a decision, so each day keeps its own date and
 * each pick keeps the price it was selected at whenever that differs from
 * today's. Quietly showing the current price under an old date would turn an
 * archive into a claim about the present.
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
    title: t(language, "app.archive.title"),
    description: t(language, "app.archive.metaDescription", { country }),
    alternates: { canonical: `/${market}/archive` },
  };
}

function dayLabel(date: string, market: string, language: string) {
  /* Noon UTC, not midnight: a midnight timestamp formatted in a timezone west
     of UTC renders as the previous day, which would date every past drop
     wrongly for the US markets.
   *
     The locale comes from the market AND the language — "August 20, 2026"
     printed under a Spanish heading is the same failure as an untranslated
     button, just harder to notice. */
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(tagFor(market, language), {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ market: string }>;
}) {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  const days = await getArchive(market);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <section className="rounded-card bg-graphite p-7 text-white sm:p-10 lg:p-12">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-white/60">
          {t(language, "app.archive.eyebrow", { country })}
        </p>
        <h1 className="mt-4 max-w-lg text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
          {t(language, "app.archive.title")}
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75">
          {t(language, "app.archive.lede")}
        </p>
        <Link
          href={`/${market}/daily-drop`}
          className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-sm font-semibold text-ink transition-opacity hover:opacity-88"
        >
          {t(language, "app.archive.backToToday")}
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      </section>

      {/* Honest empty state: before the first drop has ever run for this
          market there is nothing to show, and nothing is invented. */}
      {!days.length ? (
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-fg">
            {t(language, "app.archive.emptyTitle")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-fg-muted">
            {t(language, "app.archive.emptyText")}
          </p>
        </div>
      ) : (
        days.map((day, dayIndex) => (
          <section key={day.date} className={dayIndex === 0 ? "mt-16" : "mt-20"}>
            <SectionHeader
              id={`day-${day.date}`}
              eyebrow={t(
                language,
                /* "1 picks" reads as a bug to every visitor who sees it, and a
                   short day is now the normal outcome rather than a rarity. */
                day.picks.length === 1
                  ? "app.archive.dayEyebrowOne"
                  : "app.archive.dayEyebrow",
                { count: day.picks.length },
              )}
              title={dayLabel(day.date, market, language)}
            />
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {day.picks.map((pick, index) => (
                <li key={`${day.date}-${pick.id}`} className="flex flex-col">
                  <DealCard deal={pick} market={market} index={index} />
                  {/* Only rendered when the price has actually moved since the
                      day this ran — a silent row on every card would be noise,
                      and an absent one where it matters would be a lie. */}
                  {pick.selectedPrice != null && (
                    <p className="mt-2 px-1 text-xs text-fg-subtle tnum">
                      {t(language, "app.archive.selectedAt", {
                        price: formatPrice(pick.selectedPrice, pick.currency, market),
                      })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
