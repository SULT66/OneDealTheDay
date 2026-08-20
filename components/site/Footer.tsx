import Link from "next/link";
import { getCategoriesWithCounts } from "@/lib/catalog";
import { Logo } from "./Logo";

export async function Footer({ market }: { market: string }) {
  const categories = await getCategoriesWithCounts(market);

  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Logo market={market} />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-muted">
              One genuinely good deal a day, chosen on price evidence, product
              feedback and seller reliability.
            </p>
            {/* Required disclosure, and the single most important thing a
                first-time visitor needs to understand about the site. */}
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-fg-subtle">
              OneDailyDrop does not sell products. When you choose a deal we
              send you to the retailer, and we may earn a commission. That
              commission never adds points to a score.
            </p>
          </div>

          <nav aria-label="Categories">
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              Categories
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

          <nav aria-label="About OneDailyDrop">
            <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              How this works
            </h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  href={`/${market}/how-we-select-deals`}
                  className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                >
                  How we select deals
                </Link>
              </li>
              <li>
                <Link
                  href={`/${market}/about`}
                  className="inline-flex min-h-6 items-center text-fg-muted transition-colors hover:text-fg"
                >
                  About
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <p className="mt-10 border-t border-border pt-6 text-xs text-fg-subtle">
          © {new Date().getUTCFullYear()} OneDailyDrop. Prices and availability
          are checked periodically and can change at the retailer at any time.
        </p>
      </div>
    </footer>
  );
}
