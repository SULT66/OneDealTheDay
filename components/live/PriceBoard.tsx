"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { LiveDropView } from "./LiveDropPanel";
import { useCopy, useLanguage } from "@/components/site/CopyProvider";

/*
 * The price graphic under the stage, the way a shopping channel shows it.
 *
 * On television the price is not a line of body text: it is a band across
 * the bottom of the picture that says what the thing usually costs, what it
 * costs right now, and how long that lasts. Everything a viewer needs to
 * decide, readable from across a room.
 *
 * Before the drop opens the band shows the usual price and a clock; the drop
 * price is not on the page at all (the server has not sent it). The moment it
 * arrives the usual price is struck through, the drop price lands, the saving
 * counts up and the bar shrinks from the usual price to the new one — the
 * reveal is the show's one big moment, so it gets a moment.
 *
 * Every number is the drop's own: the usual price the host entered, the price
 * they set, the units they set or the shop reported. Nothing here is invented
 * for effect, and a drop with no usual price simply has no comparison.
 */

const clock = (totalSeconds: number | null) => {
  if (totalSeconds == null) return "--:--";
  const seconds = Math.max(0, totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
};

const openingTime = (iso: string, market: string, language: string) => {
  const zone = market === "us" ? "America/New_York" : undefined;
  try {
    return new Intl.DateTimeFormat(`${language}-${market.toUpperCase()}`, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
      timeZoneName: zone ? "short" : undefined,
    }).format(new Date(iso));
  } catch {
    return "";
  }
};

/* Counts from zero to the target once, when it first appears. */
function useCountUp(target: number, active: boolean, duration = 1100) {
  const [value, setValue] = useState(active ? 0 : target);
  const started = useRef(false);
  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }
    if (started.current) {
      setValue(target);
      return;
    }
    started.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let frame = 0;
    const begin = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    /* A background tab runs no animation frames; land on the number anyway. */
    const settle = setTimeout(() => setValue(target), duration + 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [target, active, duration]);
  return value;
}

export function PriceBoard({
  drop,
  market,
  untilStart,
  untilEnd,
}: {
  drop: LiveDropView;
  market: string;
  untilStart: number | null;
  untilEnd: number | null;
}) {
  const tr = useCopy();
  const language = useLanguage();
  const live = drop.state === "live";
  const revealed = live && drop.drop_price != null;
  const money = (value: number) => formatPrice(value, drop.currency, market);

  /* The reveal plays once, after the price has been painted in its starting
     position, so the transition has somewhere to move from. */
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!revealed) {
      setShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(frame);
  }, [revealed]);

  const percent = drop.saving?.percent ?? 0;
  const counted = useCountUp(percent, revealed && percent > 0);
  const hasCompare = drop.retail_price != null && drop.retail_price > 0;
  const dropShare =
    revealed && hasCompare ? Math.max(4, Math.min(100, ((drop.drop_price as number) / (drop.retail_price as number)) * 100)) : 100;

  const units = drop.quantity_total > 0;
  const left = drop.quantity_remaining;
  const fewLeft = live && units && left > 0 && left <= Math.max(3, Math.round(drop.quantity_total * 0.15));
  /* The clock gets its own block: on a ten-minute event the time left is as
     much of the offer as the price. */
  const timerSeconds = live ? untilEnd : drop.state === "waiting" ? untilStart : null;
  const lastMinute = live && untilEnd != null && untilEnd <= 60;

  return (
    <div
      className="relative z-20 border-t border-white/10 bg-[#050d1a] text-white"
      role="group"
      aria-label={tr("app.board.label")}
      aria-live="polite"
    >
      {/* The lime rule a shopping channel runs above its price band. */}
      <div className="h-1 w-full bg-lime" aria-hidden="true" />

      <div className="grid grid-cols-[1fr_1.35fr] sm:grid-cols-[1fr_1.35fr_0.85fr_1fr]">
        {/* Usually */}
        <div className="flex flex-col justify-center gap-1 px-3 py-3 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{tr("app.board.usually")}</p>
          {hasCompare ? (
            <p className="relative w-fit text-xl font-black leading-none text-white/80 tnum sm:text-3xl">
              {money(drop.retail_price as number)}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-[-4%] top-1/2 h-[3px] -translate-y-1/2 -rotate-6 rounded-full bg-danger transition-[width] duration-500 ease-out motion-reduce:transition-none",
                  shown ? "w-[108%]" : "w-0",
                )}
              />
            </p>
          ) : (
            <p className="text-sm font-semibold text-white/60">{drop.retailer_name || tr("app.board.atShop")}</p>
          )}
          {drop.retailer_name && hasCompare ? (
            <p className="truncate text-[10px] text-white/45">{tr("app.board.onStore", { store: drop.retailer_name })}</p>
          ) : null}
        </div>

        {/* Today's drop price */}
        <div className="relative flex flex-col justify-center overflow-hidden bg-lime px-3 py-3 text-ink sm:px-5">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink/70">
            {revealed ? tr("app.board.liveDropPrice") : tr("app.board.dropPrice")}
          </p>
          {revealed ? (
            <p
              className={cn(
                "origin-left text-3xl font-black leading-none tnum transition-all duration-500 ease-out motion-reduce:transition-none sm:text-5xl",
                shown ? "scale-100 opacity-100" : "scale-50 opacity-0",
              )}
            >
              {money(drop.drop_price as number)}
            </p>
          ) : (
            <p className="text-2xl font-black leading-none tracking-widest text-ink/35 sm:text-4xl" aria-label={tr("app.board.hidden")}>
              $ ? ? ?
            </p>
          )}
          {/* A flash across the block as the price lands. */}
          {revealed ? (
            <span
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12 bg-white/50 transition-[left] duration-700 ease-out motion-reduce:hidden",
                shown ? "left-[130%]" : "-left-1/2",
              )}
            />
          ) : null}
        </div>

        {/* The clock */}
        <div
          className={cn(
            "flex flex-col justify-center gap-1 border-t border-white/10 px-3 py-2.5 sm:border-t-0 sm:px-4",
            lastMinute ? "bg-[#ff7a68]/15" : "",
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
            {live ? tr("app.board.endsIn") : tr("app.board.opensIn")}
          </p>
          {timerSeconds != null ? (
            <p
              className={cn(
                "text-2xl font-black leading-none tnum sm:text-4xl",
                lastMinute ? "animate-pulse text-[#ff7a68]" : "text-white",
              )}
            >
              {clock(timerSeconds)}
            </p>
          ) : (
            <p className="text-lg font-black leading-none text-white tnum sm:text-2xl">{openingTime(drop.start_at, market, language)}</p>
          )}
        </div>

        {/* The saving and what is left */}
        <div className="flex flex-col justify-center gap-2 border-l border-t border-white/10 px-3 py-2.5 sm:border-t-0 sm:px-5">
          {revealed && drop.saving ? (
            <p className="flex flex-col gap-0.5">
              <span className="whitespace-nowrap text-2xl font-black leading-none text-lime tnum sm:text-[1.7rem]">{tr("app.board.off", { percent: counted })}</span>
              <span className="whitespace-nowrap text-xs font-semibold text-white/70 tnum">{tr("app.board.save", { amount: money(drop.saving.amount) })}</span>
            </p>
          ) : (
            <p className="text-xs font-semibold text-white/70">
              {hasCompare ? tr("app.board.priceDrops") : tr("app.board.revealedLive")}
            </p>
          )}

          {/* The graph: the usual price as the full bar, the drop price as the
              lime part of it. */}
          {hasCompare ? (
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-lime transition-[width] delay-300 duration-1000 ease-out motion-reduce:transition-none"
                style={{ width: `${shown ? dropShare : 100}%` }}
              />
            </div>
          ) : null}

          {units ? (
            <p className={cn("text-[11px] font-bold tnum", fewLeft ? "text-[#ff7a68]" : "text-white/70")}>
              {live
                ? left > 0
                  ? fewLeft
                    ? tr("app.board.onlyLeft", { left, total: drop.quantity_total })
                    : tr("app.board.leftAtPrice", { left, total: drop.quantity_total })
                  : tr("app.board.allClaimed")
                : tr("app.board.unitsAtPrice", { total: drop.quantity_total })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
