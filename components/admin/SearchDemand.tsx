"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * What people looked for here, and what they looked for and did not find.
 *
 * The right-hand list is the useful one. It is a shopping list written by
 * people who came to buy something and left without it — every phrase that
 * came back empty, most asked first. Until the search log existed this was
 * thrown away the moment the page rendered, and what to stock next was a
 * guess.
 *
 * The words are all that is kept. Not who typed them: no session, no address,
 * no browser. See src/searchQueries.js.
 */

type Popular = { query: string; searches: number };
type Missing = { query: string; searches: number; last_searched_at: string; best_result_count: number };
type Response = { market: string; days: number; popular: Popular[]; missing: Missing[] };

const day = (iso: string) => {
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : "";
};

export function SearchDemand({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminKey) return;
    try {
      const response = await fetch("/api/admin/search-demand", { headers: { "X-Admin-Key": adminKey } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That did not load.");
      setData(body);
      setError("");
    } catch (problem) {
      setData(null);
      setError(problem instanceof Error ? problem.message : "That did not load.");
    }
  }, [adminKey]);

  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to see what people searched for.</p>;
  if (error) return <p className="mt-4 text-sm text-fg-subtle">{error}</p>;
  if (!data) return <p className="mt-4 text-sm text-fg-subtle">Loading…</p>;

  const column = (
    heading: string,
    note: string,
    rows: { query: string; searches: number; sub?: string }[],
    empty: string,
  ) => (
    <div>
      <h3 className="text-sm font-bold text-fg">{heading}</h3>
      <p className="mt-1 text-xs leading-relaxed text-fg-muted">{note}</p>
      {rows.length ? (
        <ol className="mt-3 space-y-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.query} className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-fg">{row.query}</span>
              {row.sub && <span className="shrink-0 text-xs text-fg-subtle">{row.sub}</span>}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{row.searches}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-fg-subtle">{empty}</p>
      )}
    </div>
  );

  return (
    <div className="mt-5 grid gap-8 sm:grid-cols-2">
      {column(
        "Looked for",
        `The last ${data.days} days, most searched first.`,
        data.popular,
        "Nobody has searched yet.",
      )}
      {column(
        "Looked for and not found",
        "Each of these is somebody who wanted to buy something here and left without it. The nightly refresh already goes looking for the top few.",
        data.missing.map((row) => ({ query: row.query, searches: row.searches, sub: day(row.last_searched_at) })),
        "Every search found something.",
      )}
    </div>
  );
}
