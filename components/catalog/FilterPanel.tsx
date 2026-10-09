"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { PriceBands } from "./PriceBands";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { formatPrice, retailerLabel } from "@/lib/format";
import { searchParamsFromFilter, type listingCounts } from "@/lib/filter";
import type { DealFilter, SortKey } from "@/lib/types";
import { useCopy } from "@/components/site/CopyProvider";

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

/*
 * "70+" and "80+" stopped separating anything.
 *
 * A score is only published for a listing with real product reviews now, and
 * those land between 81 and 90, so both chips matched every scored listing and
 * neither told a shopper anything. What is worth filtering on is the thing that
 * actually divides the catalogue: 25 listings we can vouch for against 2,400 we
 * can only describe.
 */
const SCORE_STEPS = [
  { value: undefined, label: "" },
  { value: 1, label: "Scored" },
  { value: 85, label: "85+" },
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
  minimumPrice: string;
  priceRange: string;
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

/* "relevance" is offered only where it means something: with no query there is
   nothing for results to be relevant to. */
const sortOrder: SortKey[] = ["relevance", "score", "price-asc", "price-desc", "rating", "discount"];
const sortsFor = (hasQuery: boolean) =>
  hasQuery ? sortOrder : sortOrder.filter((value) => value !== "relevance");

export function FilterPanel({
  basePath,
  filter,
  market,
  currency,
  counts,
  copy,
}: {
  basePath: string;
  filter: DealFilter;
  market: string;
  currency: string;
  counts: ReturnType<typeof listingCounts>;
  copy: FilterCopy;
}) {
  const tr = useCopy();
  const router = useRouter();
  const requested = useRef(filter);
  useEffect(() => { requested.current = filter; }, [filter]);

  function go(next: DealFilter) {
    requested.current = next;
    router.replace(`${basePath}${searchParamsFromFilter(next)}`, {
      scroll: false,
    });
  }

  const update = (patch: Partial<DealFilter>) => go({ ...requested.current, ...patch });

  const active = [
    filter.maxPrice !== undefined && {
      key: "maxPrice" as const,
      label: tr("app.filter.under", {price: formatPrice(filter.maxPrice, currency, market)}),
    },
    filter.minPrice !== undefined && {
      key: "minPrice" as const,
      label: tr("app.filter.over", {price: formatPrice(filter.minPrice, currency, market)}),
    },
    filter.retailer && {
      key: "retailer" as const,
      label: retailerLabel(filter.retailer),
    },
    filter.minRating !== undefined && {
      key: "minRating" as const,
      label: tr("app.filter.ratingAndUp", {rating: filter.minRating}),
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

      <PriceBands filter={filter} buckets={counts.price.buckets} currency={currency} market={market} onApply={update} />

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
            {tr("app.filter.all")}
          </ChoiceButton>
          {counts.retailers.map((r) => (
            <ChoiceButton
              key={r.value}
              selected={filter.retailer === r.value}
              count={r.count}
              onClick={() =>
                update({ retailer: filter.retailer === r.value ? undefined : r.value })
              }
            >
              {retailerLabel(r.value)}
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
          {RATING_STEPS.map((s, index) => (
            <ChoiceButton
              key={String(s.value)}
              selected={filter.minRating === s.value}
              count={counts.rating[index]?.count}
              onClick={() => update({ minRating: s.value })}
            >
              {s.value === 4 ? tr("app.filter.ratingFour") : s.value === 4.5 ? tr("app.filter.ratingFourHalf") : copy.any}
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
          {SCORE_STEPS.map((s, index) => (
            <ChoiceButton
              key={String(s.value)}
              selected={filter.minScore === s.value}
              count={counts.score[index]?.count}
              onClick={() => update({ minScore: s.value })}
            >
              {s.value === 1 ? tr("app.filter.scored") : s.label || copy.any}
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
              {copy.belowReferenceOnly}{" "}
              <span className="font-normal tabular-nums text-fg-subtle">{counts.discounted}</span>
            </span>
            <span className="mt-0.5 block text-xs text-fg-subtle">
              {tr("app.filter.belowReferenceHint")}
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
          value={filter.sort ?? (filter.query ? "relevance" : "score")}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
          className="mt-2 h-12 w-full cursor-pointer rounded-full border border-border bg-surface px-4 text-sm text-fg outline-none transition-colors focus:border-border-strong"
        >
          {sortsFor(Boolean(filter.query)).map((value) => (
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

/*
 * A choice, and what it would leave.
 *
 * An option that leads to nothing is not offered: it is drawn, with its zero,
 * and cannot be pressed. Hiding it instead would make the panel rearrange
 * itself under the hand every time something was chosen, and the zero is worth
 * reading — "4★ and up: 0" next to this shop says something true about the
 * shop rather than about the goods.
 */
function ChoiceButton({
  selected,
  onClick,
  count,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  const empty = count === 0 && !selected;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      aria-pressed={selected}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        empty && "cursor-not-allowed border border-border text-fg-subtle opacity-55",
        !empty && "cursor-pointer",
        selected
          ? "bg-surface-inverse text-fg-on-inverse"
          : !empty && "border border-border text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span className="text-xs tabular-nums opacity-60">{count}</span>
      )}
    </button>
  );
}
