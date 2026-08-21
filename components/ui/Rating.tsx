import { Star } from "@phosphor-icons/react/ssr";
import { formatCount } from "@/lib/format";
import { t } from "@/lib/i18n";

/**
 * Star rating.
 *
 * Plenty of real listings carry no reviews at all. Rendering five empty stars
 * would read as "rated zero", so an unrated listing says so in words instead.
 * The numeric value is always spelled out beside the stars — the row never
 * relies on the glyphs alone.
 *
 * `language` is required rather than defaulted. Every string in here used to be
 * hard-coded English, so a Spanish visitor read "No product reviews yet" under a
 * Spanish heading; a default would let the next call site reintroduce exactly
 * that without anyone noticing.
 */
export function Rating({
  value,
  count,
  language,
  size = 16,
  showCount = true,
}: {
  value: number;
  count: number;
  language: string;
  size?: number;
  showCount?: boolean;
}) {
  if (!value) {
    return (
      <span className="text-sm text-fg-subtle">{t(language, "app.card.noReviews")}</span>
    );
  }

  const rounded = Math.round(value);

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={size}
            weight={i <= rounded ? "fill" : "regular"}
            className={i <= rounded ? "text-lime-deep" : "text-border-strong"}
          />
        ))}
      </span>
      <span className="font-semibold tnum">{value.toFixed(1)}</span>
      {showCount && count > 0 && (
        <span className="text-fg-subtle tnum">({formatCount(count)})</span>
      )}
      <span className="sr-only">
        {t(language, "app.card.outOfFive", { value: value.toFixed(1) })}
        {count > 0
          ? ` ${t(language, "app.card.fromReviews", { count: formatCount(count) })}`
          : ""}
      </span>
    </span>
  );
}
