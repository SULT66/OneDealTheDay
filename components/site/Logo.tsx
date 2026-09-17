import Image from "next/image";
import Link from "next/link";

/**
 * Wordmark shared by the header and footer. The tag artwork is the same brand
 * mark used by the favicon; keeping it here avoids a different identity in the
 * browser tab and the site chrome. The name stays as live text so it remains
 * sharp at every density and inherits the active light/dark theme.
 */
export function Logo({ market }: { market: string }) {
  return (
    <Link
      href={`/${market}`}
      className="group inline-flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-2.5"
      aria-label="OneDailyDrop home"
    >
      {/* Keep the tag optically level with the single-line wordmark.

          Served whole, not resized. With sizes="30px" the optimiser sent a
          32-pixel copy, which is right at 100% and a smear the moment
          anybody zooms the page or looks at it on a sharper screen. The
          full-size file is 16 KB, less than one product photo. */}
      <Image
        src="/brand/onedailydrop-tag-v2.webp"
        alt=""
        width={384}
        height={512}
        unoptimized
        priority
        className="h-8 w-auto shrink-0 object-contain sm:h-9 lg:h-10"
      />
      <span
        className="inline-flex whitespace-nowrap text-[0.875rem] font-extrabold leading-none tracking-[-0.05em] text-fg min-[360px]:text-[1.05rem] sm:text-xl lg:text-[1.45rem]"
        aria-hidden="true"
      >
        <span>OneDaily</span>
        <span className="text-lime-deep">Drop</span>
      </span>
    </Link>
  );
}
