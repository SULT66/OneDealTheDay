"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The shop's own icon next to its name.
 *
 * Served from our address rather than the shop's, so a shopper reading a list
 * of six shops does not announce that to six companies. The request is a
 * single same-origin GET that the browser then caches for a month.
 *
 * Not every shop has one, and some refuse automated requests, so the fallback
 * is a lettered circle rather than a broken image or a gap: the row keeps its
 * shape either way, and one initial in a coloured circle reads as deliberate.
 */

const hostFrom = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

/* A stable colour per shop, so the circle for a given retailer is the same
   one every time and starts to be recognisable on its own. Fixed saturation
   and lightness because the result carries white text and has to hold up on
   both the light and the dark background. */
const hueFor = (seed: string) => {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  }
  return hash;
};

const initialFor = (name: string, host: string) => {
  const source = name.trim() || host;
  return (source.match(/[a-z0-9]/i)?.[0] || "?").toUpperCase();
};

export function RetailerIcon({
  retailer,
  url,
  className,
}: {
  retailer: string;
  url: string;
  className?: string;
}) {
  const host = hostFrom(url);
  const [failed, setFailed] = useState(false);

  const shell = cn(
    "inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px]",
    className,
  );

  if (!host || failed) {
    return (
      <span
        className={cn(shell, "text-[0.55rem] font-bold leading-none text-white")}
        style={{ backgroundColor: `hsl(${hueFor(host || retailer)} 52% 42%)` }}
        aria-hidden="true"
      >
        {initialFor(retailer, host)}
      </span>
    );
  }

  return (
    <span className={cn(shell, "bg-surface-2")}>
      {/* A plain img, not next/image: this is a 16px picture coming from our
          own route, which already serves it with a month of cache. Putting it
          through the optimiser would add a second hop for no gain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/retailer-icon?host=${encodeURIComponent(host)}`}
        alt=""
        width={16}
        height={16}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
