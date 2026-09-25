/*
 * What our own tracking says about a price, in one number.
 *
 * The product page already draws the history and says a sentence about it.
 * Everywhere else — a card in a grid, a category listing, a sort — there was
 * nothing: twelve cards, every one of them a price, and no way to see that
 * one of them had fallen a fifth since we started watching and the others had
 * not moved at all. Measured on the live catalogue, that is the difference
 * between roughly a third of listings and the rest.
 *
 * So the drop is computed once a night and kept on the product, where a card
 * can read it without loading anybody's history.
 *
 * What the number means, exactly: how far today's price sits below the
 * highest daily price we ourselves recorded. Not below the seller's "was"
 * figure — that is their number and the page says so where it uses it — and
 * not below anything we did not see with our own request.
 */

/* Long enough to cover a monthly cycle, short enough that a price from the
   spring is not held against today. */
const WINDOW_DAYS = 60;
/* Under three days there is no "since we started tracking" worth printing:
   two observations are a price and its neighbour. */
const MIN_DAYS = 3;
/* Below this the badge says nothing a shopper would act on, and a catalogue
   covered in "1% off" reads as noise. */
const MIN_DROP_PERCENT = 5;

/**
 * One price per day — the last one seen that day — oldest first.
 *
 * Prices are checked four to six times a day, so counting observations rather
 * than days would weight a busy Tuesday six times a quiet Friday.
 */
function dailyCloses(observations = []) {
  const byDay = new Map();
  for (const row of observations) {
    const date = String(row?.observed_at || "").slice(0, 10);
    const price = Number(row?.price);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0) continue;
    byDay.set(date, price);
  }
  return [...byDay.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * The drop, or nothing.
 *
 * Returns the percentage today's price sits below our own tracked high, the
 * low we recorded, and how many days that rests on. A price that never moved
 * returns a drop of zero — which is the truth about most of the catalogue and
 * is why the badge has to be earned rather than assumed.
 */
function trackedDrop(observations, { now = Date.now(), windowDays = WINDOW_DAYS, minDays = MIN_DAYS, minDropPercent = MIN_DROP_PERCENT } = {}) {
  const cutoff = new Date(now - windowDays * 86400000).toISOString().slice(0, 10);
  const days = dailyCloses(observations).filter(([date]) => date >= cutoff);
  if (days.length < minDays) return { days: days.length, low: 0, high: 0, dropPercent: 0 };

  const prices = days.map(([, price]) => price);
  const current = prices[prices.length - 1];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (!(high > current)) return { days: days.length, low, high, dropPercent: 0 };

  const percent = Math.round(((high - current) / high) * 100);
  return {
    days: days.length,
    low,
    high,
    dropPercent: percent >= minDropPercent ? percent : 0,
  };
}

/**
 * Write the number onto every published product.
 *
 * One pass over the history table rather than a query per product: the
 * catalogue is a couple of thousand rows and the history a few tens of
 * thousands, and the whole thing is a second of work once a night.
 */
function updateTrackedPrices(db, { now = Date.now(), windowDays = WINDOW_DAYS } = {}) {
  const since = new Date(now - windowDays * 86400000).toISOString();
  const rows = db
    .prepare(`
      SELECT h.product_id, h.price, h.observed_at
      FROM price_history h
      JOIN products p ON p.id = h.product_id
      WHERE p.status='published' AND h.observed_at >= ?
      ORDER BY h.observed_at ASC
    `)
    .all(since);

  const byProduct = new Map();
  for (const row of rows) {
    if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
    byProduct.get(row.product_id).push(row);
  }

  const update = db.prepare("UPDATE products SET tracked_drop_percent=?, tracked_low=? WHERE id=?");
  let updated = 0;
  let withDrop = 0;
  const write = db.transaction(() => {
    /* Everything starts at nothing, so a product whose history aged out of the
       window loses its badge rather than keeping yesterday's. */
    db.prepare("UPDATE products SET tracked_drop_percent=0, tracked_low=0 WHERE status='published'").run();
    for (const [productId, observations] of byProduct) {
      const { dropPercent, low } = trackedDrop(observations, { now, windowDays });
      update.run(dropPercent, low, productId);
      updated += 1;
      if (dropPercent > 0) withDrop += 1;
    }
  });
  write();

  return { updated, withDrop };
}

module.exports = {
  MIN_DAYS,
  MIN_DROP_PERCENT,
  WINDOW_DAYS,
  dailyCloses,
  trackedDrop,
  updateTrackedPrices,
};
