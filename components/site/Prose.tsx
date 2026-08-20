import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react/ssr";

/**
 * Reading layout for the text pages. Measure is capped near 70 characters —
 * full-width paragraphs on a wide monitor are hard to track line to line.
 */
export function Prose({
  market,
  crumb,
  title,
  lede,
  children,
}: {
  market: string;
  crumb: string;
  title: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex items-center gap-1.5 text-sm text-fg-muted">
          <li>
            <Link href={`/${market}`} className="hover:text-fg">
              Home
            </Link>
          </li>
          <li aria-hidden="true">
            <CaretRight size={13} weight="bold" className="text-fg-subtle" />
          </li>
          <li aria-current="page" className="font-medium text-fg">
            {crumb}
          </li>
        </ol>
      </nav>

      <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-fg-muted">{lede}</p>

      <div
        className={[
          "mt-10 space-y-5 text-base leading-relaxed text-fg-muted",
          "[&>h2]:mt-10 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-fg",
          "[&>ul]:list-disc [&>ul]:space-y-2 [&>ul]:pl-5",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}
