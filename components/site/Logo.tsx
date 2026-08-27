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
      {/* Sized to the wordmark rather than to itself, so the tag sits level
          with the two lines of type instead of hanging below them. */}
      <Image
        src="/brand/onedailydrop-tag-v2.png"
        alt=""
        width={384}
        height={512}
        sizes="30px"
        className="h-[2.4rem] w-auto shrink-0 object-contain"
      />
      {/* A column, so the lime line inherits its width from the badge above it
          and the two edges line up exactly. Letter-spacing cannot do this: it
          adds the same gap after the final letter as between the others, which
          is why DROP always hung past the right edge of the badge. */}
      <span className="hidden flex-col items-stretch sm:flex">
        <span className="rounded-md bg-logo-badge px-1.5 py-0.5 text-center text-[0.8rem] font-extrabold uppercase leading-[1.25] tracking-[0.08em] text-white">
          One Daily
        </span>
        <span
          className="mt-[3px] flex justify-between text-[0.8rem] font-extrabold uppercase leading-[1.25] text-lime-deep"
          aria-hidden="true"
        >
          {["D", "R", "O", "P"].map((letter) => (
            <span key={letter}>{letter}</span>
          ))}
        </span>
      </span>
    </Link>
  );
}
