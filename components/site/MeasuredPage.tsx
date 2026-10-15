"use client";

import { useEffect, useRef } from "react";
import { measure, searchTerm } from "@/lib/measure";

/*
 * The two events a page reports about itself.
 *
 * Both are rendered by server components that already hold the facts — the
 * product page knows the listing, the search page knows the query and how many
 * results it found — so neither needs to re-derive anything from the URL. The
 * alternative was reading `location.search` in the browser, which is how a
 * filtered listing ends up reporting itself as a search nobody made.
 *
 * Mounted as `null`-rendering components rather than hooks so a server page can
 * drop one in without becoming a client component itself.
 */

/**
 * Somebody opened a listing.
 *
 * Keyed on the id, so a client-side navigation from one product to the next
 * reports the second one, and a re-render of the same page does not report it
 * twice.
 */
export function ViewItem({
  itemId,
  category,
  retailer,
}: {
  itemId: string | number;
  category?: string;
  retailer?: string;
}) {
  const reported = useRef<string | null>(null);

  useEffect(() => {
    const id = String(itemId);
    if (!id || reported.current === id) return;
    reported.current = id;
    measure("view_item", { item_id: id, item_category: category, retailer });
  }, [itemId, category, retailer]);

  return null;
}

/**
 * Somebody searched, and this is what they got.
 *
 * `resultCount` is the point of the event rather than a detail of it: a search
 * that returns nothing is the most useful signal the catalogue produces, and
 * it is invisible in a page-view report because the URL of a search with no
 * results looks exactly like one with forty.
 *
 * Only a real query reports. The same page with no `q` is the full listing,
 * which the page view already covers.
 */
export function SearchEvent({ query, resultCount }: { query: string; resultCount: number }) {
  const reported = useRef<string | null>(null);

  useEffect(() => {
    const term = searchTerm(query);
    if (!term) return;
    const key = `${term}|${resultCount}`;
    if (reported.current === key) return;
    reported.current = key;
    measure("search", { search_term: term, result_count: Math.max(0, Math.round(resultCount)) });
  }, [query, resultCount]);

  return null;
}
