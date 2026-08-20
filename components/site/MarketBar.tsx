import Link from "next/link";
import { Globe } from "@phosphor-icons/react/ssr";
import { getMarket, getMarkets } from "@/lib/catalog";

/**
 * The thin strip above the header, as on the reference: where the visitor is
 * shopping and what that implies, a switcher to the other markets, plus the
 * policy links that have to stay reachable from every page.
 */
export function MarketBar({ market }: { market: string }) {
  const info = getMarket(market);
  if (!info) return null;
  const markets = getMarkets();

  return (
    <div className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex items-center gap-4">
          <p className="flex items-center gap-2 text-xs text-fg-muted">
            <Globe size={14} weight="bold" aria-hidden="true" />
            <span>
              {info.country} · {info.currency} · {info.language}
            </span>
          </p>
          {markets.length > 1 && (
            <nav aria-label="Switch market">
              <ul className="flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-muted">
                {markets.map((m) => (
                  <li key={m.code}>
                    <Link
                      href={`/${m.code}`}
                      aria-current={m.code === market ? "true" : undefined}
                      className={
                        m.code === market
                          ? "text-fg"
                          : "transition-colors hover:text-fg"
                      }
                    >
                      {m.code.toUpperCase()}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <nav aria-label="Policies">
          <ul className="flex items-center gap-4 text-[0.7rem] font-semibold uppercase tracking-wide text-fg-muted">
            <li>
              <Link
                href={`/${market}/how-we-select-deals`}
                // py keeps the tap area at 24px even though the label is 11px.
                className="inline-flex min-h-6 items-center py-1 transition-colors hover:text-fg"
              >
                How we select
              </Link>
            </li>
            <li>
              <Link
                href={`/${market}/about`}
                // py keeps the tap area at 24px even though the label is 11px.
                className="inline-flex min-h-6 items-center py-1 transition-colors hover:text-fg"
              >
                About
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
