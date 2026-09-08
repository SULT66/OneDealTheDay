/*
 * Telling somebody a price fell.
 *
 * The site writes a price for every listing on every refresh, so it has always
 * known the moment one dropped — it simply had nobody to tell. That is the one
 * reason to come back that does not depend on the shopper remembering to.
 *
 * The comparison is against the price on the day they asked, stored at that
 * moment, not against a reference price somebody else set and not against
 * whatever the listing said an hour ago. "Cheaper than when you looked" is a
 * promise about their moment, and it is the only one this can keep honestly.
 */

/* Below this, a "drop" is rounding. Nobody wants an email because a listing
   moved four cents, and sending one teaches them to ignore the next. */
const MINIMUM_DROP = 0.03;

async function sendDuePriceDrops({
  db,
  sendPriceDrop,
  dealPathFor,
  unsubscribeUrlFor = () => "",
  now = Date.now(),
  minimumDrop = MINIMUM_DROP,
  batch = 200,
  logger = console,
}) {
  /*
   * Only listings a shopper can still reach. A watch on something withdrawn
   * from the catalogue is not news, and mailing a link to a page that answers
   * 410 is worse than staying quiet.
   */
  const due = db.prepare(`
    SELECT w.id, w.email, w.market, w.price_when_asked,
           p.id AS product_id, p.title, p.current_price, p.currency, p.market AS product_market
    FROM price_watches w
    JOIN products p ON p.id = w.product_id
    WHERE w.notified_at IS NULL
      AND p.status = 'published'
      AND p.current_price > 0
      AND p.current_price < w.price_when_asked * ?
    ORDER BY w.created_at
    LIMIT ?
  `).all(1 - minimumDrop, batch);

  const stamp = db.prepare("UPDATE price_watches SET notified_at=? WHERE id=?");
  let sent = 0;
  for (const watch of due) {
    try {
      await sendPriceDrop({
        email: watch.email,
        title: watch.title,
        market: watch.market || watch.product_market || "us",
        dealPath: dealPathFor(watch),
        was: Number(watch.price_when_asked).toFixed(2),
        now: Number(watch.current_price).toFixed(2),
        currency: watch.currency || "USD",
        unsubscribeUrl: unsubscribeUrlFor(watch),
      });
      /*
       * Stamped after a successful send, so a provider outage means the watch
       * is still waiting rather than silently spent. Told once: a price that
       * keeps drifting down would otherwise mail somebody every refresh.
       */
      stamp.run(new Date(now).toISOString(), watch.id);
      sent += 1;
    } catch (error) {
      logger.error(`[price-watch] ${watch.email} on ${watch.product_id}: ${error.message}`);
    }
  }
  return sent;
}

module.exports = { MINIMUM_DROP, sendDuePriceDrops };
