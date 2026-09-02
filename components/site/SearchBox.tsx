"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

/**
 * Free-text search. Hands off to the same `q` parameter the category pages and
 * Delia use, so all three routes end in one shared filter state.
 *
 * It is a real GET form, not a handler bolted to a div. It used to have no
 * action and no name on the field, so it worked only once React had hydrated;
 * before that — and on any page where hydration failed or was still on its way
 * — submitting sent the browser to the current URL carrying nothing, and the
 * query silently vanished. A reviewer typed "65 inch TV", pressed Search, and
 * landed back on the homepage with an empty box, which is the single worst
 * thing a search box can do.
 *
 * With action, method and name in place the browser alone reaches the right
 * page with the right query; the submit handler is now only the faster
 * client-side route when the script is ready.
 */
export function SearchBox({
  market,
  label,
  action,
  className,
}: {
  market: string;
  /** Both required: this is a client component, so it cannot read the
      language itself, and hard-coded English here was the most visible half of
      "switching language changes nothing" — the search box sits at the top of
      every page. */
  label: string;
  action: string;
  className?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      role="search"
      action={`/${market}/search`}
      method="get"
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
          {label}
        </label>
        <input
          id="site-search"
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={label}
          // h-full so the tap target is the whole 48px pill, not the ~23px
          // intrinsic height of the text box.
          className="h-full min-w-0 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-subtle"
        />
        <button
          type="submit"
          className="hidden h-9 cursor-pointer items-center rounded-full bg-surface-inverse px-4 text-sm font-medium text-fg-on-inverse transition-opacity hover:opacity-88 sm:inline-flex"
        >
          {action}
        </button>
      </div>
    </form>
  );
}
