import { formatDate, formatPrice } from "@/lib/format";
import { dailyPrices, daysBetween, priceVerdict } from "@/lib/priceTrend";
import type { PricePoint } from "@/lib/types";
import { WatchPrice } from "@/components/deal/WatchPrice";
import { getLanguage, t } from "@/lib/i18n";

/**
 * Tracked price over time, drawn as inline SVG — no chart library for one
 * sparkline-scale series.
 *
 * It answers the shopper's question first, in words: is today's price a good
 * one? The chart below is the evidence, one point per day, spaced by the
 * calendar rather than by how often the price happened to be checked. See
 * lib/priceTrend.ts.
 *
 * The same numbers are also published as a real table below the chart, hidden
 * visually but read by screen readers: a path element on its own tells a
 * non-sighted visitor nothing about what the price actually did.
 */
export async function PriceHistory({
  history,
  currency = "USD",
  market,
  dealId,
  priceIsCurrent = true,
}: {
  history: PricePoint[];
  currency?: string;
  market?: string;
  /* False once the last check is older than the backend's confidence window. */
  priceIsCurrent?: boolean;
  /* When given, a price that is not at its low offers to watch it. */
  dealId?: string;
}) {
  const language = await getLanguage(market ?? "us");
  const tr = (key: string, variables?: Record<string, string | number>) => t(language, key, variables);
  const days = dailyPrices(history);
  if (days.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-2 p-5 text-sm text-fg-muted">
        {tr("app.history.none")}
      </p>
    );
  }

  const money = (price: number) => formatPrice(price, currency, market);
  const day = (date: string) => formatDate(date, market);
  const verdict = priceVerdict(days, money, day, { priceIsCurrent, tr });

  const prices = days.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const first = days[0];
  const last = days[days.length - 1];
  const trackedDays = daysBetween(first.date, last.date) + 1;

  const W = 600;
  const H = 200;
  const PAD = { top: 18, right: 16, bottom: 18, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  /* By the calendar: a gap of four days takes four days of width. */
  const spanDays = Math.max(1, daysBetween(first.date, last.date));
  const x = (date: string) =>
    days.length === 1 ? PAD.left + innerW / 2 : PAD.left + (daysBetween(first.date, date) / spanDays) * innerW;
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min;
  const y = (price: number) =>
    span === 0 ? PAD.top + innerH / 2 : PAD.top + innerH - ((price - min) / span) * innerH;

  const points = days.map((p) => `${x(p.date).toFixed(1)},${y(p.price).toFixed(1)}`);
  const line = points.join(" ");
  const area = `${PAD.left},${PAD.top + innerH} ${line} ${(PAD.left + innerW).toFixed(1)},${(PAD.top + innerH).toFixed(1)}`;
  const lowPoint = [...days].reverse().find((p) => p.price === min) as (typeof days)[number];

  const tone =
    verdict?.tone === "good"
      ? "border-success/40 bg-success/10"
      : verdict?.tone === "high"
        ? "border-warning/40 bg-warning/10"
        : "border-border bg-surface-2";

  const summary = verdict ? `${verdict.headline} ${verdict.detail}` : "";

  return (
    <div className="space-y-4">
      <figure className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-fg-muted">
            {tr("app.history.trackingSince", {
              date: day(first.date),
              days: trackedDays,
              dayWord: tr(trackedDays === 1 ? "app.trend.day" : "app.trend.days"),
            })}
          </span>
          <span className="tnum text-xs text-fg-muted">
            {priceIsCurrent ? tr("app.history.today") : tr("app.history.lastSeen", { date: day(last.date) })}{" "}
            <span className="font-semibold text-fg">{money(last.price)}</span>
          </span>
        </div>

        {verdict ? (
          <div className={`mt-3 rounded-xl border px-4 py-3 ${tone}`}>
            <p className="text-base font-semibold text-fg">{verdict.headline}</p>
            {verdict.detail ? <p className="mt-0.5 text-sm text-fg-muted">{verdict.detail}</p> : null}
          </div>
        ) : null}

        {/* One day is a price, not a history: a chart of it was a single dot in
            an empty box the height of a phone screen. */}
        {days.length < 2 ? (
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-fg-muted">
            {tr("app.history.onePrice")} <span className="font-semibold text-fg tnum">{money(last.price)}</span>{" "}
            {tr("app.history.onePriceOn", { date: day(last.date) })}
          </p>
        ) : (
        <>
        <div className="mt-4 overflow-x-auto">
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

            {span > 0 && <polygon points={area} fill="currentColor" opacity={0.14} />}

            {days.length > 1 && (
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            )}

            {/* The low, marked, when it is not simply today. */}
            {span > 0 && lowPoint.date !== last.date && (
              <circle
                cx={x(lowPoint.date)}
                cy={y(min)}
                r={4}
                fill="var(--success)"
                vectorEffect="non-scaling-stroke"
              />
            )}

            <circle
              cx={x(last.date)}
              cy={y(last.price)}
              r={5}
              fill="var(--surface)"
              stroke="currentColor"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-fg-muted">
          <span className="tnum">{day(first.date)}</span>
          <span className="tnum">
            {tr("app.history.lowHigh", { low: money(min), high: money(max) })}
          </span>
          <span className="tnum">{day(last.date)}</span>
        </div>

        <figcaption className="mt-3 text-xs text-fg-subtle">
          {tr("app.history.caption")}
        </figcaption>
        </>
        )}

        {/* Same series as data, for screen readers and anyone who wants exact values. */}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-fg-muted transition-colors hover:text-fg">
            {tr("app.history.viewTable")}
          </summary>
          <table className="mt-3 w-full text-left text-sm">
            <caption className="sr-only">{tr("app.history.tableCaption")}</caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-fg-subtle">
                <th scope="col" className="pb-2 font-semibold">{tr("app.history.date")}</th>
                <th scope="col" className="pb-2 font-semibold">{tr("app.history.price")}</th>
              </tr>
            </thead>
            <tbody className="text-fg-muted">
              {[...days].reverse().map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-1.5 tnum">{day(p.date)}</td>
                  <td className="py-1.5 tnum">{money(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>

      {/* Not the moment to buy: the reason to come back, right where that
          was decided. */}
      {dealId && verdict?.suggestWatch ? (
        <WatchPrice dealId={dealId} price={money(last.price)} inputId="watch-price-email-history" />
      ) : null}
    </div>
  );
}
