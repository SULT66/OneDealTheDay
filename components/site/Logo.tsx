import Link from "next/link";

/**
 * Wordmark. The drop glyph is drawn inline rather than loaded as a file so it
 * inherits the theme tokens and never arrives after the text.
 */
export function Logo({ market }: { market: string }) {
  return (
    <Link
      href={`/${market}`}
      className="group inline-flex items-center gap-2.5"
      aria-label="OneDailyDrop — home"
    >
      <span className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-lime">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-ink"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 2.5c3.6 4.4 6.5 7.9 6.5 11.4a6.5 6.5 0 1 1-13 0C5.5 10.4 8.4 6.9 12 2.5Z"
            fill="currentColor"
          />
          <circle cx="9.6" cy="14.6" r="1.7" fill="var(--lime)" />
        </svg>
      </span>
      <span className="hidden leading-[1.05] sm:block">
        <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-fg-muted">
          One
        </span>
        <span className="block text-[0.95rem] font-bold uppercase tracking-[0.06em] text-fg">
          Daily Drop
        </span>
      </span>
    </Link>
  );
}
