import Link from "next/link";
import { Globe } from "@phosphor-icons/react/ssr";
import { getCategoriesWithCounts } from "@/lib/catalog";
import { getLanguage, hasLanguageChoice, t } from "@/lib/i18n";
import { countryOptions, languageLinks } from "@/lib/switchers";
import { Logo } from "./Logo";

export async function Footer({ market }: { market: string }) {
  const categories = await getCategoriesWithCounts(market);
  const language = await getLanguage(market);
  const countries = countryOptions(market, language);
  const languages = hasLanguageChoice(market)
    ? await languageLinks(market, language)
    : [];

  /* Privacy, terms, contact and the affiliate disclosure are rendered by the
     Express side under this same market prefix. Until now nothing linked to
     them, so they were reachable only by typing the URL — which is a problem
     beyond tidiness: both affiliate networks require them to be reachable, and
     the FTC requires the disclosure to be findable rather than merely to
     exist. */
  const legal = [
    { href: `/${market}/privacy`, label: t(language, "app.footer.privacy") },
    { href: `/${market}/terms`, label: t(language, "app.footer.terms") },
    { href: `/${market}/contact`, label: t(language, "app.footer.contact") },
    {
      href: `/${market}/affiliate-disclosure`,
      label: t(language, "app.footer.affiliate"),
    },
  ];

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div>
            <Logo market={market} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              {t(language, "app.footer.tagline")}
            </p>
            {/* Required disclosure, and the single most important thing a
                first-time visitor needs to understand about the site. */}
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-subtle">
              {t(language, "footer.disclosure")}
            </p>
          </div>

          <nav aria-label={t(language, "nav.categories")}>
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              {t(language, "nav.categories")}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {categories.slice(0, 8).map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/${market}/category/${c.slug}`}
                    className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={t(language, "app.footer.howThisWorks")}>
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              {t(language, "app.footer.howThisWorks")}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  href={`/${market}/how-we-select-deals`}
                  className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                >
                  {t(language, "app.footer.howWeSelect")}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${market}/about`}
                  className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                >
                  {t(language, "app.footer.about")}
                </Link>
              </li>
              {legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Country and language, moved down here from the strip that used to
              sit above the header. */}
          <div>
            <h2 className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              <Globe size={13} weight="bold" aria-hidden="true" />
              {t(language, "app.footer.country")}
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {countries.map((option) => (
                <li key={option.code}>
                  <Link
                    href={option.href}
                    aria-current={option.current ? "true" : undefined}
                    className={
                      option.current
                        ? "inline-flex min-h-6 items-center font-semibold text-fg"
                        : "inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                    }
                  >
                    {option.country}
                  </Link>
                </li>
              ))}
            </ul>

            {languages.length > 1 && (
              <>
                <h2 className="mt-8 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
                  {t(language, "language.label")}
                </h2>
                <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                  {languages.map((option) => (
                    <li key={option.code}>
                      <Link
                        href={option.href}
                        hrefLang={option.code}
                        aria-current={option.current ? "true" : undefined}
                        className={
                          option.current
                            ? "inline-flex min-h-6 items-center font-semibold text-fg"
                            : "inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                        }
                      >
                        {option.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-fg-subtle">
          {t(language, "app.footer.copyright", {
            year: new Date().getUTCFullYear(),
          })}
        </p>
      </div>
    </footer>
  );
}
