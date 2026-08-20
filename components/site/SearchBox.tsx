"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

/**
 * Free-text search. Hands off to the same `q` parameter the category pages and
 * Delia use, so all three routes end in one shared filter state.
 */
export function SearchBox({
  market,
  className,
}: {
  market: string;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        router.push(q ? `/${market}/search?q=${encodeURIComponent(q)}` : `/${market}`);
      }}
      className={className}
    >
      <div className="flex h-12 items-center gap-2 rounded-full border border-border bg-surface pl-4 pr-1.5 transition-colors focus-within:border-border-strong">
        <MagnifyingGlass
          size={18}
          weight="bold"
          className="shrink-0 text-fg-subtle"
          aria-hidden="true"
        />
        <label htmlFor="site-search" className="sr-only">
          Search checked deals
        </label>
        <input
          id="site-search"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search checked deals"
          // h-full so the tap target is the whole 48px pill, not the ~23px
          // intrinsic height of the text box.
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          className="hidden h-9 cursor-pointer items-center rounded-full bg-surface-inverse px-4 text-sm font-medium text-fg-on-inverse transition-opacity hover:opacity-88 sm:inline-flex"
        >
          Search
        </button>
      </div>
    </form>
  );
}
