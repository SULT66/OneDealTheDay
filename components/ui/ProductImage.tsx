"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { CategoryIcon } from "./CategoryIcon";

/**
 * Product photography with a branded stand-in.
 *
 * Three cases land on the same placeholder: a listing with no photo, a photo
 * whose host fails outright, and — the one that actually bites in production —
 * a retailer that answers a dead image URL with `200 OK` and a tiny "not
 * available" stub. eBay does exactly that: a expired listing image comes back
 * as a 78x78 graphic, so `onError` never fires and the card would show a
 * postage stamp stretched across the frame. Anything under `MIN_REAL_PX` is
 * therefore treated as missing.
 *
 * Retailer image URLs expire constantly, so this is a normal state, not an
 * error path — it is drawn in the brand palette so a card without its photo
 * still looks deliberate.
 */
const MIN_REAL_PX = 120;
export function ProductImage({
  src,
  alt,
  categoryIcon,
  fill = true,
  width,
  height,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  categoryIcon: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showPlaceholder = !src || failed;

  /* A cached image can finish loading before React attaches onLoad, so the
     event never fires. Measuring from a ref callback covers both paths: the
     ref runs on mount with `complete` already true for cache hits. */
  const measure = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth && img.naturalWidth < MIN_REAL_PX) {
      setFailed(true);
    }
  }, []);

  if (showPlaceholder) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center",
          // Deliberately light in both themes: product shots sit on white, so a
          // light stand-in keeps the grid visually even.
          "bg-[linear-gradient(135deg,var(--lime)_0%,var(--mist)_62%)]",
          className,
        )}
        role="img"
        aria-label={alt}
      >
        <CategoryIcon
          name={categoryIcon}
          size={64}
          weight="duotone"
          className="text-ink/55"
        />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      {...(fill ? { fill: true } : { width, height })}
      sizes={sizes}
      priority={priority}
      ref={measure}
      onError={() => setFailed(true)}
      onLoad={(e) => {
        const img = e.currentTarget;
        if (img.naturalWidth && img.naturalWidth < MIN_REAL_PX) setFailed(true);
      }}
      className={cn("object-contain", className)}
    />
  );
}
