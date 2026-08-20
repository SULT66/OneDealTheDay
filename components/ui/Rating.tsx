import { Star } from "@phosphor-icons/react/ssr";
import { formatCount } from "@/lib/format";

/**
 * Star rating.
 *
 * Plenty of real listings carry no reviews at all. Rendering five empty stars
 * would read as "rated zero", so an unrated listing says so in words instead.
 * The numeric value is always spelled out beside the stars — the row never
 * relies on the glyphs alone.
 */
export function Rating({
  value,
  count,
  size = 16,
  showCount = true,
}: {
  value: number;
  count: number;
  size?: number;
  showCount?: boolean;
}) {
  if (!value) {
    return (
      <span className="text-sm text-fg-subtle">No product reviews yet</span>
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
        {value.toFixed(1)} out of 5
        {count > 0 ? ` from ${formatCount(count)} reviews` : ""}
      </span>
    </span>
  );
}
