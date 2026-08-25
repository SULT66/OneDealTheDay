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
      aria-label="OneDailyDrop home"
    >
      <span className="relative inline-flex h-12 w-9 shrink-0 items-center justify-center">
        <Image
          src="/brand/onedailydrop-tag-v2.png"
          alt=""
          width={384}
          height={512}
          sizes="36px"
          className="h-full w-full object-contain"
        />
      </span>
      <span className="hidden leading-[1.2] sm:block">
        <span className="inline-block rounded-md bg-logo-badge px-1.5 py-0.5 text-[0.8rem] font-bold uppercase tracking-[0.08em] text-white">
          One Daily
        </span>
        <span className="block px-1.5 text-[0.8rem] font-bold uppercase tracking-[0.62em] text-lime-deep">
          Drop
        </span>
      </span>
    </Link>
  );
}
