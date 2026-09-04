"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * One tab in the site row, which now answers two questions it used to ignore:
 * is this thing clickable, and am I on it.
 *
 * The old row was flat grey text with a barely-there background on hover, and
 * nothing at all marked the current page — you could stand on About and the
 * row looked exactly as it did from the homepage. Both are fixed with the same
 * device rather than two: a lime rule under the label, which grows from the
 * middle when the pointer is over a tab and simply stays there on the one you
 * are on.
 *
 * A client component because `usePathname` is the only honest way to know the
 * current page; the header around it stays on the server.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  /* Prefix, not equality, so /us/category/power-tools still lights Categories.
     The trailing slash matters: without it /us/save would light /us/saved. */
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`group relative inline-flex h-9 items-center rounded-full px-4 text-sm transition-colors ${
        current
          ? "font-semibold text-fg"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      {label}
      <span
        aria-hidden="true"
        /* Anchored to the text, not the pill, so the rule is as wide as the
           word rather than as wide as the padding around it. */
        className={`pointer-events-none absolute inset-x-4 bottom-1 h-0.5 origin-center rounded-full bg-lime transition-transform duration-200 ${
          current ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
        }`}
      />
    </Link>
  );
}
