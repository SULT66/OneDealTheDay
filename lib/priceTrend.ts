import type { PricePoint } from "./types";

/*
 * What a price history means to somebody deciding whether to buy.
 *
 * The chart used to plot every check as its own point, evenly spaced: a
 * product checked six times on Tuesday and once on Friday drew Tuesday six
 * times as wide as the three days after it, and a two-day history looked like
 * a price that had "always" been this. Somebody reading it wanted one answer —
 * buy now, or wait — and had to work it out from a line.
 *
 * So: one point per day, the last price seen that day, and a verdict in words
 * that never claims more than the history can support.
 */

export type DailyPrice = { date: string; price: number };

export type PriceVerdict = {
  tone: "good" | "neutral" | "high";
  /* One sentence, the answer. */
  headline: string;
  /* A second, supporting sentence, or empty. */
  detail: string;
  /* Whether it is worth offering to watch the price. */
  suggestWatch: boolean;
};

/* Days need at least this much history before we call a price low or high. */
export const MIN_DAYS_FOR_VERDICT = 3;

/* Words come from the site's dictionary (app.trend.*), so the verdict reads in
   the visitor's language. */
export type Translate = (key: string, variables?: Record<string, string | number>) => string;

const DAY_MS = 24 * 60 * 60 * 1000;

export function dailyPrices(history: PricePoint[]): DailyPrice[] {
  const byDay = new Map<string, number>();
  for (const point of history) {
    const date = String(point.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(point.price) || point.price <= 0) continue;
    /* History arrives oldest first, so the last write for a day is its
       closing price. */
    byDay.set(date, point.price);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([date, price]) => ({ date, price }));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * The verdict. `format` turns a price into text and `formatDay` a date, so the
 * wording stays in one place and the currency and locale stay the page's.
 */
export function priceVerdict(
  days: DailyPrice[],
  format: (price: number) => string,
  formatDay: (date: string) => string,
  { priceIsCurrent = true, tr }: { priceIsCurrent?: boolean; tr: Translate },
): PriceVerdict | null {
  if (!days.length) return null;
  const first = days[0];
  const current = days[days.length - 1];

  /* A price we have not been able to recheck is not "today's", and no
     judgement about it is worth making. Listings the refresh stops finding
     are retired after two days; until then, say plainly how old it is. */
  if (!priceIsCurrent) {
    return {
      tone: "neutral",
      headline: tr("app.trend.lastSaw", { date: formatDay(current.date) }),
      detail: tr("app.trend.lastSawDetail"),
      suggestWatch: false,
    };
  }
  const tracked = daysBetween(first.date, current.date) + 1;
  const prices = days.map((day) => day.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  /* The most recent day the price was at its low, before today. */
  const lowDay = [...days].reverse().find((day) => day.price === low) as DailyPrice;

  if (tracked < MIN_DAYS_FOR_VERDICT) {
    return {
      tone: "neutral",
      headline: tr("app.trend.started", { date: formatDay(first.date) }),
      detail: tr("app.trend.startedDetail"),
      suggestWatch: true,
    };
  }

  const change = recentChange(days, 7);
  const changeText = change ? describeChange(change, format, tr) : "";

  if (high === low) {
    return {
      tone: "neutral",
      headline: tr("app.trend.flat", { days: tracked }),
      detail: tr("app.trend.flatDetail", { price: format(current.price), date: formatDay(first.date) }),
      suggestWatch: true,
    };
  }

  if (current.price <= low) {
    return {
      tone: "good",
      headline: tr("app.trend.lowest", { date: formatDay(first.date) }),
      detail: changeText || tr("app.trend.asHighAs", { price: format(high) }),
      suggestWatch: false,
    };
  }

  const aboveLow = Math.round(((current.price - low) / low) * 100);
  if (current.price >= high) {
    return {
      tone: "high",
      headline: tr("app.trend.highest", { date: formatDay(first.date) }),
      detail:
        aboveLow > 0
          ? tr("app.trend.wasOnLess", { price: format(low), date: formatDay(lowDay.date), percent: aboveLow })
          : tr("app.trend.wasOn", { price: format(low), date: formatDay(lowDay.date) }),
      suggestWatch: true,
    };
  }

  if (aboveLow <= 2) {
    return {
      tone: "good",
      headline: aboveLow <= 0 ? tr("app.trend.withinCent") : tr("app.trend.withinPercent", { percent: aboveLow }),
      detail: changeText || tr("app.trend.lowWas", { price: format(low), date: formatDay(lowDay.date) }),
      suggestWatch: false,
    };
  }

  return {
    tone: aboveLow >= 10 ? "high" : "neutral",
    headline: tr("app.trend.aboveLow", { percent: aboveLow }),
    detail: `${tr("app.trend.wasOn", { price: format(low), date: formatDay(lowDay.date) })}${changeText ? ` ${changeText}` : ""}`,
    suggestWatch: true,
  };
}

type Change = { amount: number; percent: number; days: number };

/* Today's price against the closest day at least `window` days back, or the
   first day when the history is shorter than that. */
export function recentChange(days: DailyPrice[], window: number): Change | null {
  if (days.length < 2) return null;
  const current = days[days.length - 1];
  const earlier =
    [...days].reverse().find((day) => daysBetween(day.date, current.date) >= window) || days[0];
  const span = daysBetween(earlier.date, current.date);
  if (span <= 0 || earlier.price === current.price) return null;
  const amount = current.price - earlier.price;
  return { amount, percent: Math.round((amount / earlier.price) * 100), days: span };
}

function describeChange(change: Change, format: (price: number) => string, tr: Translate): string {
  const percent = Math.abs(change.percent);
  return tr(change.amount < 0 ? "app.trend.down" : "app.trend.up", {
    amount: format(Math.abs(change.amount)),
    percent: percent ? ` (${percent}%)` : "",
    days: change.days,
    dayWord: tr(change.days === 1 ? "app.trend.day" : "app.trend.days"),
  });
}
