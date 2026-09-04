"use client";

import { useEffect, useRef, useState } from "react";
import { Storefront } from "@phosphor-icons/react";

/**
 * A shop's logo, or a plain shop glyph when there is no logo to be had.
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
export function StoreLogo({ host }: { host: string }) {
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

  /*
   * A shop glyph rather than the shop's initial.
   *
   * The initial was the obvious thing and the wrong thing: a bold single
   * letter in a rounded grey tile is the shape of a brand mark, and the G it
   * drew for Giftlab was read as Google's. A storefront says "a shop whose
   * logo we do not have" and cannot be mistaken for anybody's identity.
   */
  if (failed || !host) {
    return (
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-fg-subtle"
      >
        <Storefront size={17} weight="regular" />
      </span>
    );
  }

  return (
    /*
     * The pale plate is not decoration. A favicon is drawn to sit on that
     * shop's own site and many are dark marks on transparency — Tribesigns is
     * one, and in dark mode it disappeared into the tile behind it. Every logo
     * gets the light ground it was drawn for, in both themes, which is also
     * why the strip reads as one row rather than as six different treatments.
     */
    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- the source is
          the shop's own favicon behind our own proxy, at a size the image
          optimiser has nothing to do with. */}
      <img
        ref={image}
        src={`/api/retailer-icon?host=${encodeURIComponent(host)}`}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-6 w-6 object-contain"
      />
    </span>
  );
}
