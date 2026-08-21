import Image from "next/image";
import Link from "next/link";

/**
 * Wordmark shared by the header and footer. The tag artwork is the same brand
 * mark used by the favicon; keeping it here avoids a different identity in the
 * browser tab and the site chrome.
 */
export function Logo({ market }: { market: string }) {
  return (
    <Link
      href={`/${market}`}
      className="group inline-flex items-center gap-2.5"
      aria-label="OneDailyDrop — home"
    >
      <span className="relative inline-flex h-12 w-9 shrink-0 items-center justify-center">
        <Image
          src="/brand/onedailydrop-tag.png"
          alt=""
          width={384}
          height={512}
          sizes="36px"
          className="h-full w-full object-contain"
        />
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
