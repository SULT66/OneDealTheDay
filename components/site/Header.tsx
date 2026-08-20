import Link from "next/link";
import { getCategoriesWithCounts } from "@/lib/catalog";
import { getLanguage, t } from "@/lib/i18n";
import { Logo } from "./Logo";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";

/**
 * Site chrome. Navigation sits in the same place on every page and the category
 * row scrolls horizontally rather than wrapping into a wall of links on narrow
 * screens.
 */
export async function Header({ market }: { market: string }) {
  const categories = await getCategoriesWithCounts(market);
  const language = await getLanguage(market);

  return (
    <header className="sticky top-0 z-40 bg-bg/95 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-5 sm:px-6">
          <Logo market={market} />

          {/* Below sm the search wraps to its own full-width row: sharing the
              line with the logo and controls squeezed it to ~50px, which is
              too narrow to read a query in, let alone tap accurately. */}
          <SearchBox
            market={market}
            className="order-last w-full min-w-0 sm:order-none sm:ml-4 sm:w-auto sm:max-w-xl sm:flex-1"
          />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            <DeliaTrigger
              variant="header"
              label={t(language, "app.header.askDelia")}
              className="hidden md:inline-flex"
            />
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="border-b border-border bg-surface">
        <nav
          aria-label={t(language, "nav.categories")}
          className="mx-auto max-w-7xl px-4 sm:px-6"
        >
          <ul className="flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* The drop is one feature now rather than the front door, so this
                is an ordinary tab instead of the permanently highlighted one it
                was while the homepage and the drop were the same page. */}
            <li className="shrink-0">
              <Link
                href={`/${market}/daily-drop`}
                className="inline-flex h-9 items-center rounded-full px-4 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {t(language, "app.nav.dailyDrop")}
              </Link>
            </li>
            {categories.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link
                  href={`/${market}/category/${c.slug}`}
                  className="inline-flex h-9 items-center rounded-full px-4 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
