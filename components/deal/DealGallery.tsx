"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ProductImage } from "@/components/ui/ProductImage";

/**
 * Main image plus thumbnails. Most listings carry a single photo, so the
 * thumbnail strip only appears when there is genuinely something to switch
 * between.
 */
export function DealGallery({
  images,
  alt,
  categoryIcon,
}: {
  images: string[];
  alt: string;
  categoryIcon: string;
}) {
  const [active, setActive] = useState(0);
  const shots = images.length > 0 ? images : [""];
  const current = shots[Math.min(active, shots.length - 1)];

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-card border border-border bg-white">
        <ProductImage
          src={current}
          alt={alt}
          categoryIcon={categoryIcon}
          sizes="(max-width: 1024px) 100vw, 45vw"
          priority
          className="p-8"
        />
      </div>

      {shots.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {shots.map((src, i) => (
            <li key={`${src}-${i}`}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show image ${i + 1} of ${shots.length}`}
                aria-pressed={i === active}
                className={cn(
                  "relative h-20 w-20 cursor-pointer overflow-hidden rounded-2xl border-2 bg-white transition-colors",
                  i === active
                    ? "border-lime-deep"
                    : "border-border hover:border-border-strong",
                )}
              >
                <ProductImage
                  src={src}
                  alt=""
                  categoryIcon={categoryIcon}
                  sizes="80px"
                  className="p-1.5"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
