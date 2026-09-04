"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A shop's logo, or its initial when there is no logo to be had.
 *
 * /api/retailer-icon answers 404 for a shop whose site offers no favicon we
 * can read, and Giftlab is one of them. Left alone that draws a browser's
 * torn-page glyph in a row of real logos, which reads as the page being broken
 * rather than as the shop being without a picture.
 *
 * A client component only because a broken image is a runtime event that no
 * server can know about. The markup matches on both sides, so nothing shifts
 * on hydration.
 */
export function StoreLogo({ host, name }: { host: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const image = useRef<HTMLImageElement>(null);

  /*
   * onError alone is not enough, and this is where the first attempt failed.
   *
   * The image is requested while the HTML is still streaming, so by the time
   * React hydrates the request has usually already failed — the error event
   * fired before any handler existed to hear it, and the placeholder stayed on
   * screen. An image that has finished loading with no intrinsic width is one
   * that failed, whenever that happened, so this asks rather than waits.
   */
  useEffect(() => {
    const element = image.current;
    if (element?.complete && element.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed || !host) {
    return (
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-sm font-bold text-fg-muted"
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- the source is the
       shop's own favicon behind our own proxy, at a size the image optimiser
       has nothing to do with. */
    <img
      ref={image}
      src={`/api/retailer-icon?host=${encodeURIComponent(host)}`}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-7 w-7 shrink-0 rounded-md object-contain"
    />
  );
}
