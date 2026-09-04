import Link from "next/link";
import { getLanguage, hasLanguageChoice, t } from "@/lib/i18n";
import { languageLinks } from "@/lib/switchers";
import { Logo } from "./Logo";
import { AccountButton } from "./AccountButton";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { DeliaTrigger } from "@/components/delia/DeliaTrigger";
import { LiveNavLink } from "@/components/live/LiveNavLink";

/**
 * Site chrome. Navigation sits in the same place on every page and the category
 * row scrolls horizontally rather than wrapping into a wall of links on narrow
 * screens.
 */
export async function Header({ market }: { market: string }) {
  const language = await getLanguage(market);
  /* The language choice sits in the header rather than only in the footer:
     a visitor who lands on the wrong language should not have to scroll the
     whole page to find the way out of it. The country switcher stays in the
     footer — it is picked once, and usually correctly, from the IP address. */
  const languages = hasLanguageChoice(market) ? await languageLinks(market, language) : [];

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
            label={t(language, "app.card.searchLabel")}
            action={t(language, "app.card.searchButton")}
            className="order-last w-full min-w-0 sm:order-none sm:ml-4 sm:w-auto sm:max-w-xl sm:flex-1"
          />

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
            {languages.length > 1 && (
              <nav aria-label={t(language, "language.label")}>
                <ul className="flex items-center rounded-full border border-border bg-surface p-0.5">
                  {languages.map((option) => (
                    <li key={option.code}>
                      {/* A plain <a>, not <Link>, on purpose.
                      *
                      * The Header and Footer live in app/[market]/layout.tsx.
                      * Switching language only changes the query string, so
                      * <Link> does a client-side navigation and Next reuses the
                      * cached layout — the page body came back in the new
                      * language while the header, the category tabs and this
                      * very switcher stayed in the old one. It read as "the
                      * toggle does nothing".
                      *
                      * A full document request re-renders the layout and lets
                      * Express set the odd_lang_<market> cookie on the way
                      * through, which is what makes the choice stick. */}
                      <a
                        href={option.href}
                        hrefLang={option.code}
                        aria-current={option.current ? "true" : undefined}
                        title={option.label}
                        className={
                          option.current
                            ? "inline-flex h-8 items-center rounded-full bg-lime px-3 text-xs font-semibold uppercase tracking-wide text-ink"
                            : "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold uppercase tracking-wide text-fg-muted transition-colors hover:text-fg"
                        }
                      >
                        {option.code}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <Link
              href={`/${market}#subscribe`}
              className="hidden h-11 shrink-0 cursor-pointer items-center rounded-full bg-lime px-5 text-sm font-semibold text-ink transition-opacity hover:opacity-88 sm:inline-flex"
            >
              {t(language, "app.header.subscribe")}
            </Link>
            <DeliaTrigger
              variant="header"
              label={t(language, "app.header.askDelia")}
              className="hidden md:inline-flex"
            />
            {/* Last in the row, after Delia. There was no way into the account
                from anywhere on the site before this: it could only be reached
                by typing the address. Quiet rather than loud, because
                subscribing is still the thing worth a shopper's attention. */}
            <AccountButton
              market={market}
              signInLabel={t(language, "app.header.signIn")}
              signOutLabel={t(language, "app.header.signOut")}
              className="hidden h-11 shrink-0 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-60 sm:inline-flex"
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
          {/* Every individual category used to be its own tab here; they now
              live under the "Categories" page (app/[market]/category), so
              this row is a short, fixed list instead of one tab per category. */}
          <ul className="flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              /* First, ahead of the drop. A live event is the only thing on
                 this row that can be over by the time somebody looks again,
                 and it was sitting second where it read as one more browsing
                 tab. Red in both states, with the dot doing the work — see
                 LiveNavLink. */
              { href: `/${market}/live`, label: t(language, "app.nav.live"), live: true },
              {
                href: `/${market}/daily-drop`,
                // The drop is the one thing on this row worth a visitor's
                // full attention, so it keeps the brand colour the browsing
                // and information tabs don't.
                accent: true,
                label: t(language, "app.nav.dailyDrop"),
              },
              { href: `/${market}/category`, label: t(language, "nav.categories") },
              { href: `/${market}/about`, label: t(language, "app.footer.about") },
              {
                href: `/${market}/how-we-select-deals`,
                label: t(language, "app.nav.howWeCheckStores"),
              },
              /* Saving something and then not being able to find it again is
                 worse than not being able to save it. The account button in the
                 row above turns into Log out once somebody is signed in, so
                 this row is the only way back to the list. */
              { href: `/${market}/saved`, label: t(language, "app.nav.saved") },
              /* The shops behind the catalogue, and the one page on the
                 site whose links pay on anything bought after them. It lived
                 in the footer, where a page nobody scrolls to earns nothing. */
              { href: `/${market}/stores`, label: t(language, "app.nav.stores") },
            ].map((item) => (
              <li key={item.href} className="shrink-0">
                {item.live ? (
                  <LiveNavLink market={market} label={item.label} />
                ) : (
                  <Link
                    href={item.href}
                    className={
                      item.accent
                        ? "inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold text-lime-deep transition-colors hover:bg-surface-2"
                        : "inline-flex h-9 items-center rounded-full px-4 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    }
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
