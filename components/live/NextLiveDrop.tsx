"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LiveDropView } from "./LiveDropPanel";

/**
 * The teaser on the home page.
 *
 * Renders nothing at all when no drop is scheduled. A permanent "Live Drop"
 * banner sitting empty most of the week would train people to scroll past the
 * one thing we want them to notice on the day it is real, and a placeholder
 * counting down to nothing is worse than no banner.
 *
 * It shows the product and the clock, never the price: the price is not in the
 * response until the drop opens, which is the mechanic the format rests on.
 */
export function NextLiveDrop({ market }: { market: string }) {
  const [drop, setDrop] = useState<LiveDropView | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const response = await fetch(`/api/live/current?market=${encodeURIComponent(market)}`).catch(
        () => null,
      );
      if (cancelled || !response || !response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { drop?: LiveDropView | null };
      if (cancelled) return;
      setDrop(body.drop || null);
      const view = body.drop;
      setSeconds(
        view ? (view.state === "live" ? view.seconds_until_end : view.seconds_until_start) : null,
      );
    };
    check();
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  useEffect(() => {
    const ticking = setInterval(
      () => setSeconds((value) => (value == null ? value : Math.max(0, value - 1))),
      1000,
    );
    return () => clearInterval(ticking);
  }, []);

  if (!drop || drop.state === "ended" || drop.state === "sold_out") return null;

  const live = drop.state === "live";
  const total = Math.max(0, seconds ?? 0);
  const hours = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  const countdown =
    hours > 0
      ? `${hours}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
      : `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

  return (
    <section aria-labelledby="live-drop-title" className="mt-10">
      <Link
        href={`/${market}/live`}
        className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-border bg-surface px-5 py-4 transition-colors hover:bg-surface-2"
      >
        <span
          className={
            live
              ? "inline-flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-danger"
              : "inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-fg-muted"
          }
        >
          {live && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-danger" aria-hidden="true" />
          )}
          {live ? "Live now" : "Next live drop"}
        </span>

        <span id="live-drop-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {drop.title}
        </span>

        <span className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-[0.12em] text-fg-subtle">
            {live ? "Closes in" : "Opens in"}
          </span>
          <span className="text-lg font-black text-fg tnum">{countdown}</span>
        </span>
      </Link>
    </section>
  );
}
