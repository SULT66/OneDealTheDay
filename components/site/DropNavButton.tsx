"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag } from "@phosphor-icons/react";

/**
 * The Daily Drop, at the far end of the row and shaped like a destination.
 *
 * It used to sit second, immediately after Live, and the row read red, green,
 * grey, grey, grey, grey — two loud things shouting next to each other and
 * then a long quiet tail. Moving it to the opposite end gives the row two
 * anchors with the browsing links between them, which is the shape a
 * navigation bar wants: what is on now at one end, where to go at the other.
 *
 * Outlined rather than filled, and that is the point of the treatment. The
 * lime button in the row above is the mailing-list call to action; a second
 * filled lime pill directly beneath it would be two identical buttons stacked
 * and neither would mean anything. This one is the same colour drawn as a
 * border, so it belongs to the brand without competing — and filling on hover
 * is then a real reaction rather than a shade of grey moving.
 */
export function DropNavButton({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-lime px-4 text-sm font-semibold transition-colors ${
        /* On its own page it is already filled, so hovering it changes
           nothing — which is correct: there is nowhere to go. */
        current
          ? "bg-lime text-fg-on-lime"
          : "text-lime-deep hover:bg-lime hover:text-fg-on-lime"
      }`}
    >
      <Tag size={15} weight="fill" aria-hidden="true" />
      {label}
    </Link>
  );
}
