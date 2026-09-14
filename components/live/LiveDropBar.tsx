"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LiveDropView } from "./LiveDropPanel";

/*
 * A thin strip above every page while a Live Drop is on the calendar.
 *
 * Most visitors arrive on a product page from a search and never see the
 * homepage, which is where the drop teaser lived, so the one event the site is
 * built towards was invisible to most of the people on it. This follows them
 * everywhere, and only while there is something real to point at: no drop
 * scheduled, no strip. A permanent banner counting down to nothing trains
 * people to stop seeing it.
 *
 * Hidden on the Live page itself, which is already the thing it links to.
 * Closing it hides it for that drop only; the next drop brings it back.
 */

const DISMISSED_KEY = "odd_live_bar_dismissed";

const countdown = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${pad(minutes)}:${pad(total % 60)}`;
};

export function LiveDropBar({ market }: { market: string }) {
  const pathname = usePathname();
  const [drop, setDrop] = useState<LiveDropView | null>(null);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY));
    } catch {
      /* Storage blocked: the strip simply cannot be closed for good. */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const response = await fetch(`/api/live/current?market=${encodeURIComponent(market)}`).catch(() => null);
      if (cancelled || !response || !response.ok) return;
      const body = (await response.json().catch(() => ({}))) as { drop?: LiveDropView | null };
      if (cancelled) return;
      const view = body.drop || null;
      setDrop(view);
      setSeconds(view ? (view.state === "live" ? view.seconds_until_end : view.seconds_until_start) : null);
    };
    check();
    const timer = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [market]);

  useEffect(() => {
    const ticking = setInterval(() => setSeconds((value) => (value == null ? value : Math.max(0, value - 1))), 1000);
    return () => clearInterval(ticking);
  }, []);

  if (!drop || !["upcoming", "waiting", "live"].includes(drop.state)) return null;
  if (pathname?.startsWith(`/${market}/live`)) return null;
  if (dismissed === drop.drop_key) return null;

  const live = drop.state === "live";
  /* Within a day, a clock; further out, the day and hour, which is what
     somebody plans around. */
  const when = live
    ? `closes in ${countdown(seconds ?? 0)}`
    : (seconds ?? 0) < 24 * 3600
      ? `starts in ${countdown(seconds ?? 0)}`
      : new Date(drop.start_at).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });

  return (
    <div className={live ? "bg-danger text-white" : "bg-surface-inverse text-fg-on-inverse"}>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <Link href={`/${market}/live`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            <span className={`absolute inline-flex h-full w-full rounded-full ${live ? "animate-ping bg-white/70" : "bg-danger/60 animate-ping"}`} />
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? "bg-white" : "bg-danger"}`} />
          </span>
          <span className="shrink-0 font-bold uppercase tracking-[0.12em]">{live ? "Live now" : "Live Drop"}</span>
          <span className="min-w-0 truncate opacity-85">
            <span className="hidden sm:inline">{drop.title} · </span>
            <span className="tnum">{when}</span>
          </span>
          <span
            className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-white text-danger" : "bg-lime text-ink"}`}
          >
            {live ? "Join now" : "Remind me"}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(drop.drop_key);
            try {
              localStorage.setItem(DISMISSED_KEY, drop.drop_key);
            } catch {
              /* Hidden for this page view only. */
            }
          }}
          aria-label="Hide the Live Drop bar"
          className="shrink-0 cursor-pointer rounded-full px-1.5 text-base leading-none opacity-70 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
