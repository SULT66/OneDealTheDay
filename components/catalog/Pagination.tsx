import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

/**
 * Page controls for a listing.
 *
 * A category page used to render every match at once. Electronics held 834
 * listings, the page shipped 500 of them in one document of 2.9MB, and it took
 * 22 seconds to open — longer than the shopping assistant a customer had
 * already walked out on. Nobody reads five hundred cards; the first two dozen
 * are the page.
 *
 * Links rather than buttons, so a page can be shared, opened in a new tab and
 * indexed, and so the whole thing works before any JavaScript arrives.
 */
export function Pagination({
  page,
  totalPages,
  hrefForPage,
  label,
  previousLabel,
  nextLabel,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
  label: string;
  previousLabel: string;
  nextLabel: string;
}) {
  if (totalPages <= 1) return null;

  /* First, last, and a window around where the reader is. Long catalogues
     otherwise print a hundred numbers nobody aims at. */
  const numbers: Array<number | "gap"> = [];
  for (let candidate = 1; candidate <= totalPages; candidate += 1) {
    const near = Math.abs(candidate - page) <= 1;
    const edge = candidate === 1 || candidate === totalPages;
    if (near || edge) {
      if (numbers.length && numbers[numbers.length - 1] !== "gap") {
        const previous = numbers[numbers.length - 1];
        if (typeof previous === "number" && candidate - previous > 1) numbers.push("gap");
      }
      numbers.push(candidate);
    }
  }

  const step =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors";

  return (
    <nav aria-label={label} className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && (
        <Link
          href={hrefForPage(page - 1)}
          rel="prev"
          className={cn(step, "border border-border text-fg hover:bg-surface-2")}
        >
          <CaretLeft size={14} weight="bold" aria-hidden="true" />
          <span className="ml-1">{previousLabel}</span>
        </Link>
      )}

      {numbers.map((entry, index) =>
        entry === "gap" ? (
          <span key={`gap-${index}`} className="px-1 text-sm text-fg-subtle" aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={hrefForPage(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={cn(
              step,
              "tnum",
              entry === page
                ? "bg-surface-inverse text-fg-on-inverse"
                : "border border-border text-fg hover:bg-surface-2",
            )}
          >
            {entry}
          </Link>
        ),
      )}

      {page < totalPages && (
        <Link
          href={hrefForPage(page + 1)}
          rel="next"
          className={cn(step, "border border-border text-fg hover:bg-surface-2")}
        >
          <span className="mr-1">{nextLabel}</span>
          <CaretRight size={14} weight="bold" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}
