"use client";

import { useCallback, useEffect, useState } from "react";

/*
 * How the business is doing, on one screen.
 *
 * Every number here already existed and none of them could be looked at: the
 * clicks were in one admin endpoint, the Live Drop funnel in another, and
 * subscribers, accounts and price watches were counted nowhere at all. Asked
 * how many people arrived and how many signed up, the honest answer was that
 * the site knew and there was nowhere to see it.
 *
 * Read in the order a person moves through the site — arrived, showed
 * interest, left for a shop — rather than grouped by which table each number
 * lives in, because the shape of the funnel is the thing worth seeing and the
 * database layout is nobody's question.
 */

type Overview = {
  days: number;
  engagedSessions: number;
  audience: {
    subscribers: number;
    unsubscribed: number;
    subscribedInWindow: number;
    accounts: number;
    accountsInWindow: number;
    accountsViaGoogle: number;
  };
  intent: { savedProducts: number; priceWatches: number; priceWatchesWaiting: number; priceWatchesTold: number };
  outbound: { total: number; unattributed: number; toAProduct: number; toAShop: number };
  live: {
    drops: number;
    published: number;
    reached: number;
    sawThePrice: number;
    wentToBuy: number;
    remindersAsked: number;
    remindersSent: number;
    announcementsSent: number;
  };
  catalogue: { listings: number; withReviews: number };
  notMeasuredHere: string[];
};

const count = (value: number) => value.toLocaleString("en-US");

export function Numbers({ adminKey }: { adminKey: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!adminKey) return;
    try {
      const response = await fetch(`/api/admin/overview?days=${days}`, {
        headers: { "X-Admin-Key": adminKey },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "That key was not accepted.");
      setData(body);
      setError("");
    } catch (problem) {
      setData(null);
      setError(problem instanceof Error ? problem.message : "That did not load.");
    }
  }, [adminKey, days]);

  /* Same debounce as the drops list: the key is typed, not pasted in one go,
     and every keystroke would otherwise be a rejected request. */
  useEffect(() => {
    const timer = setTimeout(load, 400);
    return () => clearTimeout(timer);
  }, [load]);

  if (!adminKey) return <p className="mt-4 text-sm text-fg-subtle">Enter the admin key to see the numbers.</p>;
  if (error) return <p className="mt-4 text-sm text-fg-subtle">{error}</p>;
  if (!data) return <p className="mt-4 text-sm text-fg-subtle">Loading…</p>;

  const { audience, intent, outbound, live, catalogue } = data;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 30, 90].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            aria-pressed={days === option}
            className={`inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-xs font-semibold transition-colors ${
              days === option
                ? "bg-surface-inverse text-fg-on-inverse"
                : "border border-border text-fg-muted hover:bg-surface-2"
            }`}
          >
            {option} days
          </button>
        ))}
        {/* The window applies to what happens over time. Totals that are a
            standing count — how many subscribers there are — say so on the
            row itself rather than being silently clipped to the window. */}
        <span className="text-xs text-fg-subtle">for anything that happened in a window</span>
      </div>

      <Group title="People">
        <Stat
          label="People we could recognise"
          value={count(data.engagedSessions)}
          note={`in ${days} days · ${count(outbound.unattributed)} clicks had no one attached`}
        />
        <Stat
          label="Email subscribers"
          value={count(audience.subscribers)}
          note={`${count(audience.subscribedInWindow)} new · ${count(audience.unsubscribed)} left`}
        />
        <Stat
          label="Accounts"
          value={count(audience.accounts)}
          note={`${count(audience.accountsInWindow)} new · ${count(audience.accountsViaGoogle)} by Google`}
        />
      </Group>

      <Group title="Interest">
        <Stat label="Products saved" value={count(intent.savedProducts)} note="all time" />
        <Stat
          label="Price watches"
          value={count(intent.priceWatches)}
          note={`${count(intent.priceWatchesWaiting)} waiting · ${count(intent.priceWatchesTold)} emailed`}
        />
        <Stat
          label="Listings with reviews"
          value={count(catalogue.withReviews)}
          note={`of ${count(catalogue.listings)} published`}
        />
      </Group>

      <Group title="Left for a shop">
        <Stat
          label="Clicks out"
          value={count(outbound.total)}
          note={`in ${days} days · ${count(outbound.unattributed)} unattributed`}
        />
        <Stat label="To a product" value={count(outbound.toAProduct)} note="the deal itself" />
        <Stat label="To a whole shop" value={count(outbound.toAShop)} note="anything they buy counts" />
      </Group>

      <Group title="Live Drop">
        <Stat label="Drops" value={count(live.drops)} note={`${count(live.published)} published`} />
        <Stat
          label="Reached a drop"
          value={count(live.reached)}
          note={`${count(live.sawThePrice)} saw the price · ${count(live.wentToBuy)} went to buy`}
        />
        <Stat
          label="Reminders"
          value={count(live.remindersAsked)}
          note={`${count(live.remindersSent)} sent · ${count(live.announcementsSent)} announcements`}
        />
      </Group>

      {/*
        * The gaps, named. A missing number that nobody names gets filled in
        * with a guess, and a guessed top of the funnel makes every rate under
        * it a fiction.
        */}
      <div className="mt-6 rounded-2xl border border-border bg-surface-2 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Not counted here</p>
        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-fg-muted">
          {data.notMeasuredHere.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{title}</h3>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">{children}</dl>
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-bold text-fg tnum">{value}</dd>
      <p className="mt-0.5 text-xs text-fg-subtle">{note}</p>
    </div>
  );
}
