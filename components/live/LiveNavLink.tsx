"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Live = { state: string; secondsUntilStart: number | null; secondsUntilEnd: number | null };

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The LIVE tab: a channel that is always there, lit only when it is on air.
 *
 * It used to be grey when nothing was running and red when something was, so
 * on an ordinary day it read as one more browsing tab and nobody learned the
 * site holds live events at all. The red is permanent now — the mark of a
 * channel, the way a record button is red whether or not it is pressed — and
 * what changes is the dot beside it.
 *
 * Off air: a hollow ring, still. On air: a filled dot, pulsing, with the time
 * left counting down beside the word. Those two are not a shade apart; one of
 * them moves and carries a clock, which is the difference somebody notices
 * from across the page rather than by comparing.
 *
 * The countdown runs locally from a length in seconds rather than towards a
 * timestamp, so a browser with a wrong clock still counts the right length of
 * time. The server is asked again every thirty seconds, which corrects drift
 * long before ten minutes are up.
 */
export function LiveNavLink({ market, label }: { market: string; label: string }) {
  const [live, setLive] = useState<Live | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const response = await fetch(`/api/live/current?market=${encodeURIComponent(market)}`).catch(
        () => null,
      );
      if (cancelled || !response || !response.ok) return;
      const body = (await response.json().catch(() => ({}))) as {
        drop?: {
          state?: string;
          seconds_until_start?: number | null;
          seconds_until_end?: number | null;
        } | null;
      };
      if (cancelled) return;
      const drop = body.drop;
      if (!drop?.state) {
        setLive(null);
        setRemaining(null);
        return;
      }
      const next: Live = {
        state: drop.state,
        secondsUntilStart: drop.seconds_until_start ?? null,
        secondsUntilEnd: drop.seconds_until_end ?? null,
      };
      setLive(next);
      setRemaining(next.state === "live" ? next.secondsUntilEnd : next.secondsUntilStart);
    };
    check();
    /* Thirty seconds. This runs on every page of the site, so it cannot be a
       tight poll; but a drop lasts ten minutes, and a minute of staleness on a
       ten minute event is a tenth of the countdown wrong. */
    const timer = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  /* Ticked here rather than re-fetched, so the number moves every second
     without a request every second. */
  const counting = remaining != null;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => {
      setRemaining((value) => (value == null || value <= 0 ? value : value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [counting]);

  const onAir = live?.state === "live";
  const soon = live?.state === "waiting";
  const lit = onAir || soon;

  return (
    <Link
      href={`/${market}/live`}
      /* Red in both states. The tab is the channel, not the event. */
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-danger transition-colors hover:bg-surface-2"
      aria-label={
        onAir ? `${label} — a drop is open now` : soon ? `${label} — a drop opens shortly` : label
      }
    >
      <span
        aria-hidden="true"
        className={
          lit
            ? "h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger"
            : /* Hollow and still: the channel is there, nothing is on it. */
              "h-2 w-2 shrink-0 rounded-full border border-danger/70"
        }
      />
      <span className={onAir ? "animate-pulse" : undefined}>{label}</span>
      {lit && remaining != null && remaining > 0 && (
        <span className="text-xs font-semibold tabular-nums opacity-80">
          {onAir ? clock(remaining) : `in ${clock(remaining)}`}
        </span>
      )}
    </Link>
  );
}
