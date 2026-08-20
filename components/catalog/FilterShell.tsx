"use client";

import { useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";

/**
 * Collapses the filters behind a button on narrow screens and leaves them
 * permanently open from `lg` up.
 *
 * The open state is CSS-driven for desktop (`hidden lg:block`) and only
 * JS-driven for mobile, so the sidebar is never briefly missing on a desktop
 * first paint, and the panel is rendered exactly once — no duplicated inputs
 * fighting over the same label ids.
 */
export function FilterShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="rounded-card border border-border bg-surface p-5 lg:sticky lg:top-44 lg:border-0 lg:bg-transparent lg:p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex h-11 w-full cursor-pointer items-center gap-2 text-sm font-semibold text-fg lg:hidden"
      >
        <SlidersHorizontal size={18} weight="bold" aria-hidden="true" />
        Filters and sorting
        <span className="ml-auto text-fg-subtle">{open ? "Hide" : "Show"}</span>
      </button>

      <div
        id={panelId}
        className={cn("lg:mt-0", open ? "mt-5 block" : "hidden lg:block")}
      >
        {children}
      </div>
    </div>
  );
}
