"use client";

import { Sparkle } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useDelia } from "./DeliaContext";

/**
 * Every way into Delia.
 *
 * `hero` is the large circular control that sits on the seam of the split hero
 * — the first thing the eye lands on, and the site's main entry point.
 * `floating` follows the visitor down every other page; `header` and `inline`
 * are the quieter text versions.
 */
export function DeliaTrigger({
  variant = "header",
  label = "Ask Delia",
  seed,
  productId,
  className,
}: {
  variant?: "hero" | "floating" | "header" | "inline";
  label?: string;
  seed?: string;
  /* The catalogue product this trigger sits on, when it sits on one. Delia
     then looks that product up instead of searching for it by name. */
  productId?: string;
  className?: string;
}) {
  const { openDelia } = useDelia();
  const onClick = () => openDelia(seed, productId);

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Ask Delia: search checked deals"
        className={cn(
          "delia-pulse group relative isolate z-10 flex flex-col items-center justify-center",
          "h-28 w-28 cursor-pointer rounded-full bg-ink text-white sm:h-32 sm:w-32",
          "shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] ring-8 ring-lime",
          "transition-transform duration-200 hover:scale-105 active:scale-95",
          className,
        )}
      >
        <Sparkle size={30} weight="fill" aria-hidden="true" />
        <span aria-hidden="true" className="mt-1 text-[0.7rem] font-bold uppercase tracking-[0.12em]">
          Ask Delia
        </span>
      </button>
    );
  }

  if (variant === "floating") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Ask Delia: search checked deals"
        className={cn(
          "delia-pulse fixed bottom-5 right-5 z-30 isolate inline-flex h-14 items-center gap-2",
          "cursor-pointer rounded-full bg-ink pl-4 pr-5 text-white ring-4 ring-lime",
          "shadow-[0_14px_32px_-10px_rgb(0_0_0/0.5)]",
          "transition-transform duration-200 hover:scale-105 active:scale-95",
          className,
        )}
      >
        <Sparkle size={22} weight="fill" aria-hidden="true" />
        <span className="text-sm font-semibold">Delia</span>
      </button>
    );
  }

  const tone =
    variant === "header"
      ? "border border-border-strong text-fg hover:bg-surface-2"
      : "bg-lime text-ink hover:bg-lime-deep";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full px-5",
        "text-sm font-semibold transition-colors",
        tone,
        className,
      )}
    >
      <Sparkle size={16} weight="fill" aria-hidden="true" />
      {label}
    </button>
  );
}
