import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";

/**
 * Section title with an optional "see all" link on the right — the layout the
 * reference uses above every horizontal row.
 */
export function SectionHeader({
  id,
  eyebrow,
  title,
  action,
  children,
}: {
  /** Set when a section uses aria-labelledby, so the heading itself is the
      label rather than a second hidden copy of the same words. */
  id?: string;
  eyebrow?: string;
  title: string;
  action?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-fg-subtle">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {title}
        </h2>
      </div>

      {children}

      {action && (
        <Link
          href={action.href}
          className="inline-flex min-h-6 items-center gap-1.5 py-1 text-sm font-semibold text-fg transition-colors hover:text-fg-muted"
        >
          {action.label}
          <ArrowRight size={16} weight="bold" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
