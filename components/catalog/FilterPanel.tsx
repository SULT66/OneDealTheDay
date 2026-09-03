"use client";

import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { formatPrice, retailerLabel } from "@/lib/format";
import { searchParamsFromFilter } from "@/lib/filter";
import type { DealFilter, SortKey } from "@/lib/types";

/**
 * Filters live in the URL, not in component state.
 *
 * That is what makes a filtered view shareable, survive a reload and a back
 * button, and — the reason it matters most here — lets Delia hand off a spoken
 * request straight into this page by building the same query string.
 *
 * The current filter arrives as a prop from the server rather than through
 * useSearchParams, so this component needs no Suspense boundary.
 */

/* "Any" is filled in from the translated copy bag at render time; the star and
   number labels are language-neutral already. */
const RATING_STEPS = [
  { value: undefined, label: "" },
  { value: 4, label: "4★ and up" },
  { value: 4.5, label: "4.5★ and up" },
];

const SCORE_STEPS = [
  { value: undefined, label: "" },
  { value: 70, label: "70+" },
  { value: 80, label: "80+" },
];

/**
 * Every visible string in this panel arrives pre-translated from the server.
 *
 * This is a client component, so it cannot read the request's language itself,
 * and the labels used to be hard-coded English module constants — a filter
 * sidebar reading "Best score / Highest rated / Clear all" beside a German
 * heading was a large part of why switching language looked like it did
 * nothing.
 */
export type FilterCopy = {
  activeFilters: string;
  clearAll: string;
  removeFilter: string;
  maximumPrice: string;
  retailer: string;
  productRating: string;
  score: string;
  belowReferenceOnly: string;
  belowReference: string;
  sortBy: string;
  any: string;
  /* Plain strings, not functions of the count. React refuses to send a function
     across the server/client boundary, and TypeScript cannot see that — the
     build passed and every filtered page returned a 500. The server already
     knows both numbers, so it formats them. */
  scoreAtLeast: string;
  matchCount: string;
  sorts: Record<SortKey, string>;
};

const sortOrder: SortKey[] = ["score", "price-asc", "price-desc", "rating", "discount"];

export function FilterPanel({
  basePath,
  filter,
  market,
  currency,
  retailers,
  bounds,
  copy,
}: {
  basePath: string;
  filter: DealFilter;
  market: string;
  currency: string;
  retailers: string[];
  bounds: { min: number; max: number };
  copy: FilterCopy;
}) {
  const router = useRouter();

  function go(next: DealFilter) {
    router.replace(`${basePath}${searchParamsFromFilter(next)}`, {
      scroll: false,
    });
  }

  const update = (patch: Partial<DealFilter>) => go({ ...filter, ...patch });

  const active = [
    filter.maxPrice !== undefined && {
      key: "maxPrice" as const,
      label: `Under ${formatPrice(filter.maxPrice, currency, market)}`,
    },
    filter.minPrice !== undefined && {
      key: "minPrice" as const,
      label: `Over ${formatPrice(filter.minPrice, currency, market)}`,
    },
    filter.retailer && {
      key: "retailer" as const,
      label: retailerLabel(filter.retailer),
    },
    filter.minRating !== undefined && {
      key: "minRating" as const,
      label: `${filter.minRating}★ and up`,
    },
    filter.minScore !== undefined && {
      key: "minScore" as const,
      label: copy.scoreAtLeast,
    },
    filter.discountedOnly && {
      key: "discountedOnly" as const,
      label: copy.belowReference,
    },
    filter.query && { key: "query" as const, label: `“${filter.query}”` },
  ].filter(Boolean) as Array<{ key: keyof DealFilter; label: string }>;

  const maxValue = filter.maxPrice ?? bounds.max;

  return (
    <div className="space-y-7">
      {active.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
              {copy.activeFilters}
            </h3>
            <button
              type="button"
              /* The query is listed above as a removable chip like every other
                 active filter, so keeping it made "Clear all" clear all but
                 one — and the one it kept was the only one the shopper had
                 typed. Sort is not a filter and is not listed, so it stays. */
              onClick={() => go({ sort: filter.sort })}
              className="cursor-pointer text-xs font-semibold text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              {copy.clearAll}
            </button>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {active.map((a) => (
              <li key={String(a.key)}>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...filter };
                    delete next[a.key];
                    go(next);
                  }}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-lime px-3.5 text-sm font-semibold text-ink transition-opacity hover:opacity-85"
                >
                  {a.label}
                  <X size={13} weight="bold" aria-hidden="true" />
                  <span className="sr-only">{copy.removeFilter}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* price */}
      <div>
        <label
          htmlFor="filter-max-price"
          className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
        >
          {copy.maximumPrice}
        </label>
        <p className="mt-2 text-lg font-bold text-fg tnum">
          {formatPrice(maxValue, currency, market)}
        </p>
        <input
          id="filter-max-price"
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={5}
          value={maxValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            update({ maxPrice: v >= bounds.max ? undefined : v });
          }}
          className="mt-2 h-11 w-full cursor-pointer accent-[var(--lime-deep)]"
        />
        <p className="flex justify-between text-xs text-fg-subtle tnum">
          <span>{formatPrice(bounds.min, currency, market)}</span>
          <span>{formatPrice(bounds.max, currency, market)}+</span>
        </p>
      </div>

      {/* retailer */}
      <fieldset>
        <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          {copy.retailer}
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          <ChoiceButton
            selected={!filter.retailer}
            onClick={() => update({ retailer: undefined })}
          >
            All
          </ChoiceButton>
          {retailers.map((r) => (
            <ChoiceButton
              key={r}
              selected={filter.retailer === r}
              onClick={() =>
                update({ retailer: filter.retailer === r ? undefined : r })
              }
            >
              {retailerLabel(r)}
            </ChoiceButton>
          ))}
        </div>
      </fieldset>

      {/* rating */}
      <fieldset>
        <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          {copy.productRating}
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {RATING_STEPS.map((s) => (
            <ChoiceButton
              key={String(s.value)}
              selected={filter.minRating === s.value}
              onClick={() => update({ minRating: s.value })}
            >
              {s.label || copy.any}
            </ChoiceButton>
          ))}
        </div>
      </fieldset>

      {/* score */}
      <fieldset>
        <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
          {copy.score}
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCORE_STEPS.map((s) => (
            <ChoiceButton
              key={String(s.value)}
              selected={filter.minScore === s.value}
              onClick={() => update({ minScore: s.value })}
            >
              {s.label || copy.any}
            </ChoiceButton>
          ))}
        </div>
      </fieldset>

      {/* discount */}
      <div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={!!filter.discountedOnly}
            onChange={(e) =>
              update({ discountedOnly: e.target.checked || undefined })
            }
            className="mt-0.5 h-5 w-5 cursor-pointer accent-[var(--lime-deep)]"
          />
          <span>
            <span className="block text-sm font-semibold text-fg">
              {copy.belowReferenceOnly}
            </span>
            <span className="mt-0.5 block text-xs text-fg-subtle">
              Hides listings with no verified reference price to compare against.
            </span>
          </span>
        </label>
      </div>

      {/* sort */}
      <div>
        <label
          htmlFor="filter-sort"
          className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle"
        >
          {copy.sortBy}
        </label>
        <select
          id="filter-sort"
          value={filter.sort ?? "score"}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
          className="mt-2 h-12 w-full cursor-pointer rounded-full border border-border bg-surface px-4 text-sm text-fg outline-none transition-colors focus:border-border-strong"
        >
          {sortOrder.map((value) => (
            <option key={value} value={value}>
              {copy.sorts[value]}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-fg-muted tnum" role="status">
        {copy.matchCount}
      </p>
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium transition-colors",
        selected
          ? "bg-surface-inverse text-fg-on-inverse"
          : "border border-border text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
