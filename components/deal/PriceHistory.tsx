import { formatDate, formatPrice } from "@/lib/format";
import type { PricePoint } from "@/lib/types";

/**
 * Tracked price over time, drawn as inline SVG — no chart library for one
 * sparkline-scale series.
 *
 * The same numbers are also published as a real table below the chart, hidden
 * visually but read by screen readers: a path element on its own tells a
 * non-sighted visitor nothing about what the price actually did.
 */
export function PriceHistory({
  history,
  currency = "USD",
  market,
}: {
  history: PricePoint[];
  currency?: string;
  market?: string;
}) {
  if (history.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-2 p-5 text-sm text-fg-muted">
        No tracked price observations yet for this listing.
      </p>
    );
  }

  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = history[0];
  const last = history[history.length - 1];

  const W = 600;
  const H = 200;
  const PAD = { top: 18, right: 16, bottom: 28, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min;
  const x = (i: number) =>
    history.length === 1
      ? PAD.left + innerW / 2
      : PAD.left + (i / (history.length - 1)) * innerW;
  const y = (price: number) =>
    span === 0
      ? PAD.top + innerH / 2
      : PAD.top + innerH - ((price - min) / span) * innerH;

  const points = history.map((p, i) => `${x(i).toFixed(1)},${y(p.price).toFixed(1)}`);
  const line = points.join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${(PAD.left + innerW).toFixed(1)},${(PAD.top + innerH).toFixed(1)}`;

  const changed = last.price !== first.price;
  const direction = last.price < first.price ? "fallen" : "risen";
  const summary = changed
    ? `Tracked price has ${direction} from ${formatPrice(first.price, currency, market)} on ${formatDate(first.date, market)} to ${formatPrice(last.price, currency, market)} on ${formatDate(last.date, market)}. Lowest tracked: ${formatPrice(min, currency, market)}.`
    : `Tracked price has held at ${formatPrice(last.price, currency, market)} across ${history.length} observation${history.length === 1 ? "" : "s"}.`;

  return (
    <figure className="rounded-2xl border border-border bg-surface p-5">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={summary}
          className="h-auto w-full min-w-[280px] text-lime-deep"
          preserveAspectRatio="none"
        >
          {/* baseline, kept low-contrast so it never competes with the data */}
          <line
            x1={PAD.left}
            y1={PAD.top + innerH}
            x2={PAD.left + innerW}
            y2={PAD.top + innerH}
            stroke="var(--border)"
            strokeWidth={1.5}
          />

          {span > 0 && (
            <polygon points={area} fill="currentColor" opacity={0.14} />
          )}

          <polyline
            points={line}
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {history.length > 1 && (
            <circle
              cx={x(history.length - 1)}
              cy={y(last.price)}
              r={5}
              fill="var(--surface)"
              stroke="currentColor"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-fg-muted">
        <span className="tnum">{formatDate(first.date, market)}</span>
        <span className="tnum">
          Low {formatPrice(min, currency, market)} · High{" "}
          {formatPrice(max, currency, market)}
        </span>
        <span className="tnum">{formatDate(last.date, market)}</span>
      </div>

      <figcaption className="mt-3 text-sm text-fg-muted">
        {history.length} tracked price observation
        {history.length === 1 ? "" : "s"}. {summary}
      </figcaption>

      {/* Same series as data, for screen readers and anyone who wants exact values. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
          View tracked prices as a table
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">Tracked price by date</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-fg-subtle">
              <th scope="col" className="pb-2 font-semibold">Date</th>
              <th scope="col" className="pb-2 font-semibold">Price</th>
            </tr>
          </thead>
          <tbody className="text-fg-muted">
            {history.map((p) => (
              <tr key={p.date} className="border-t border-border">
                <td className="py-1.5 tnum">{formatDate(p.date, market)}</td>
                <td className="py-1.5 tnum">
                  {formatPrice(p.price, currency, market)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
