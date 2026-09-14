"use client";

import { useCallback, useEffect, useState } from "react";
import type { Period } from "./Numbers";

/*
 * Week by week: the numbers frozen when each week closed.
 *
 * A snapshot is taken automatically once a week, when the report week closes
 * (Friday 00:00 New York time, just after the Thursday Live Drop), and kept.
 * Each cell shows its change against the week below it, so a row reads
 * "better or worse than the week before" without doing any sums.
 */

type Snapshot = { weekStart: string; weekEnd: string; firstDay: string; lastDay: string; takenAt: string; metrics: Period };
type WeeklyResponse = { timezone: string; next_snapshot_at: string; this_week: Period; weeks: Snapshot[] };

const COLUMNS: { key: keyof Period; label: string; visitors?: boolean; upIsBad?: boolean }[] = [
  { key: "visitors", label: "Visitors", visitors: true },
  { key: "liveVisitors", label: "Opened Live page", visitors: true },
  { key: "peopleToShop", label: "Went to a shop" },
  { key: "subscribers", label: "Want every drop" },
  { key: "subscribersJoined", label: "Joined" },
  { key: "subscribersLeft", label: "Unsubscribed", upIsBad: true },
  { key: "accountsJoined", label: "New accounts" },
  { key: "dropPagePeople", label: "On a drop page" },
  { key: "dropPressedBuy", label: "Pressed buy" },
];

const count = (value: number) => Number(value || 0).toLocaleString("en-US");
const day = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function Weekly({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<WeeklyResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminKey) return;
    try {
      const response = await fetch("/api/admin/weekly", { headers: { "X-Admin-Key": adminKey } });
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

  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to see the weeks.</p>;
  if (error) return <p className="mt-4 text-sm text-fg-subtle">{error}</p>;
  if (!data) return <p className="mt-4 text-sm text-fg-subtle">Loading…</p>;

  const rows = [
    { label: "This week so far", sub: `closes ${new Date(data.next_snapshot_at).toLocaleString()}`, metrics: data.this_week, live: true },
    ...data.weeks.map((week) => ({
      label: `${day(week.firstDay)} – ${day(week.lastDay)}`,
      sub: `taken ${new Date(week.takenAt).toLocaleDateString()}`,
      metrics: week.metrics,
      live: false,
    })),
  ];

  return (
    <div className="mt-5">
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-fg-subtle">
              <th className="px-4 py-2 font-medium">Week</th>
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-2 text-right font-medium">{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const older = rows[index + 1]?.metrics;
              return (
                <tr key={row.label} className={`border-b border-border last:border-0 ${row.live ? "bg-surface-2" : ""}`}>
                  <td className="px-4 py-2.5 align-top">
                    <span className="block font-semibold text-fg">{row.label}</span>
                    <span className="block text-xs text-fg-subtle">{row.sub}</span>
                  </td>
                  {COLUMNS.map((column) => {
                    const value = row.metrics[column.key] as number;
                    const notCounted = column.visitors && !row.metrics.visitorsCounted && !value;
                    const before = older ? (older[column.key] as number) : null;
                    const comparable = before !== null && !(column.visitors && older && !older.visitorsCounted) && !row.live;
                    const diff = comparable ? value - (before as number) : 0;
                    const good = diff === 0 ? null : (diff > 0) !== Boolean(column.upIsBad);
                    return (
                      <td key={column.key} className="px-3 py-2.5 text-right align-top tnum">
                        <span className="font-semibold text-fg">{notCounted ? "—" : count(value)}</span>
                        {comparable && diff !== 0 && (
                          <span className={`block text-xs font-semibold ${good ? "text-[#2f8a3e]" : "text-danger"}`}>
                            {diff > 0 ? "▲" : "▼"} {count(Math.abs(diff))}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-prose text-xs leading-relaxed text-fg-subtle">
        A week runs Friday to Thursday ({data.timezone.replace("_", " ")} time), so it includes that
        Thursday&rsquo;s Live Drop. It is saved automatically when it closes and never changes after.
        Arrows compare with the week below. &ldquo;—&rdquo; means visitors were not counted yet that week.
        Your own browser is not counted.
      </p>
    </div>
  );
}
