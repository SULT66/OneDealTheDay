import type { Metadata } from "next";
import Link from "next/link";
import { CaretRight } from "@phosphor-icons/react/ssr";
import { getCategoriesWithCounts, getMarket } from "@/lib/catalog";
import { countryName, getLanguage, t } from "@/lib/i18n";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

export async function generateMetadata({
  params,
}: PageProps<"/[market]/category">): Promise<Metadata> {
  const { market } = await params;
  const info = getMarket(market);
  const language = await getLanguage(market);
  const country = info ? countryName(market, language) : t(language, "app.yourMarket");
  return {
    title: t(language, "nav.categories"),
    description: t(language, "app.home.metaDescription", { country }),
    alternates: { canonical: `/${market}/category` },
  };
}

/**
 * Every category the header used to list inline. Pulled out to its own page
 * once the header nav collapsed to Daily Drop / About / Categories / How we
 * check stores, so the categories themselves still have one clear home.
 */
export default async function CategoryIndexPage({
  params,
}: PageProps<"/[market]/category">) {
  const { market } = await params;
  const language = await getLanguage(market);
  const categories = await getCategoriesWithCounts(market, language);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
      <nav aria-label={t(language, "app.list.breadcrumb")} className="mb-6">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
          <li>
            <Link href={`/${market}`} className="hover:text-fg">
              {t(language, "page.home")}
            </Link>
          </li>
          <li aria-hidden="true">
            <CaretRight size={13} weight="bold" className="text-fg-subtle" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {t(language, "nav.categories")}
          </li>
        </ol>
      </nav>

      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          {t(language, "nav.categories")}
        </h1>
      </header>

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
    </div>
  );
}
