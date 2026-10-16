/*
 * One letter to somebody who has never come back.
 *
 * This was asked for as "sixty days without an open", and that is not a
 * question this database can answer. There is no open tracking anywhere in the
 * system and that is deliberate: src/mailer.js turns SendGrid's open pixel and
 * link rewriting off, because both are what bulk marketing looks like to Gmail
 * and the letters were landing in Promotions with them on. Nothing records that
 * a message was read, and nothing is going to start — so a rule written in
 * opens would either be invented or would mean turning the tracking back on and
 * paying for it in deliverability for every email the site sends.
 *
 * What the database does record, per address:
 *
 *   subscribers.digest_opt_in_at   set by clicking the tokened link in the
 *                                  day-seven letter. This is the one click
 *                                  inside an email that the site does record,
 *                                  because the link lands on our own route.
 *   price_watches.email            asked to be told when a price falls
 *   live_drop_reminders.email      asked to be reminded about a drop
 *   users.email                    made an account
 *   subscriber_sequence            which letters we have actually sent them
 *
 * The clicks and analytics_events tables are keyed to an anonymous browser
 * session with no address on them at all, so a subscriber cannot be joined to
 * anything they did on the site. That is the gap, and it is worth naming
 * rather than papering over: this letter cannot tell a reader who reads every
 * email and buys from the shop's own search from a reader who has never opened
 * one. It only knows that nothing we can see has come back from this address.
 *
 * So the rule is "no recorded action", not "no opens", and the letter says so
 * in those words. Once per subscriber, ever: the point is to ask a question,
 * and asking it twice is the behaviour that earns a spam report.
 */

const { digestItemFor } = require("./weeklyDigest");

/* The step key in subscriber_sequence, which already has a unique index on
   (subscriber_id, step). That index is the whole of "only ever once": no new
   table, and no second fact that can disagree with the first. */
const REACTIVATION_STEP = "reactivation";

/*
 * How long is long enough.
 *
 * Counted from the subscription, not from the last email, because what is
 * being asked is "has this address ever done anything" and the answer does not
 * change with our sending schedule. Sixty days is long enough that the welcome
 * letters are well past (the last is day seven) and at least a few drops have
 * come and gone, and short enough that the reader still recognises the name.
 */
const QUIET_DAYS = 60;

/* Three, as asked, and three is also the number that keeps the letter a
   letter rather than a second digest. */
const MISSED_ITEMS = 3;

const iso = (value) => new Date(value).toISOString();

const daysAgo = (days, now) => iso(new Date(now).getTime() - days * 24 * 3600 * 1000);

/**
 * Subscribers who joined a while ago and have never done anything we record.
 *
 * Every clause is a thing that actually exists in the database. There is no
 * clause for opens, because there is nothing to put in it.
 */
function dormantSubscribers(db, { market = "us", now = Date.now(), quietDays = QUIET_DAYS, limit = 200 } = {}) {
  return db
    .prepare(
      `SELECT s.id, s.email, s.market, s.created_at, s.unsubscribe_token
         FROM subscribers s
        WHERE s.status = 'active'
          AND s.unsubscribe_token <> ''
          AND s.market = ?
          AND s.created_at <= ?
          /* Still on the per-drop list. Somebody who has already slowed their
             own mail down has answered this letter's question in advance. */
          AND s.drop_opt_in = 1
          /* Clicked the link in the day-seven letter. The one in-email click
             this system can see, and proof enough that the list is read. */
          AND s.digest_opt_in = 0
          /* We have to have actually written to them before asking why they
             are quiet: the day-seven letter is the last of the welcome series,
             so its row means the whole first week went out. */
          AND EXISTS (
            SELECT 1 FROM subscriber_sequence q
             WHERE q.subscriber_id = s.id AND q.step = 'digest_invite'
          )
          AND NOT EXISTS (
            SELECT 1 FROM subscriber_sequence q
             WHERE q.subscriber_id = s.id AND q.step = ?
          )
          /* Asked us to watch a price for them. */
          AND NOT EXISTS (
            SELECT 1 FROM price_watches w WHERE lower(w.email) = lower(s.email)
          )
          /* Pressed "remind me" on a drop. */
          AND NOT EXISTS (
            SELECT 1 FROM live_drop_reminders r WHERE lower(r.email) = lower(s.email)
          )
          /* Made an account with the same address. */
          AND NOT EXISTS (
            SELECT 1 FROM users u WHERE lower(u.email) = lower(s.email)
          )
        ORDER BY s.id
        LIMIT ?`,
    )
    .all(market, daysAgo(quietDays, now), REACTIVATION_STEP, limit);
}

/**
 * What this subscriber actually missed.
 *
 * Not "three good listings": three listings the Sunday email carried after
 * this person joined. "You missed these" is a claim, and digest_items is the
 * record that makes it a true one — the alternative, picking today's best
 * three and calling them missed, is the sort of sentence this site exists to
 * not write.
 *
 * Newest Sunday first, one row per product, and only the ones still published
 * with a live price — a card pointing at a listing that has gone is worse than
 * no card.
 *
 * @param {Map} presented  product id → the listing as presentProduct() returns
 *   it. Passed in rather than queried, so this module stays about choosing and
 *   the presentation rules stay in one place.
 */
function missedItemsFor(db, subscriber, { presented, limit = MISSED_ITEMS, market = "us", siteOrigin } = {}) {
  const rows = db
    .prepare(
      `SELECT product_id, MAX(sent_at) AS sent_at
         FROM digest_items
        WHERE market = ? AND sent_at > ?
        GROUP BY product_id
        ORDER BY sent_at DESC`,
    )
    .all(market, subscriber.created_at);

  const items = [];
  for (const row of rows) {
    if (items.length >= limit) break;
    const product = presented.get(Number(row.product_id)) || presented.get(String(row.product_id));
    if (!product || !product.deal_url || !product.image_url) continue;
    if (!(Number(product.current_price) > 0)) continue;
    items.push(digestItemFor(product, { market, siteOrigin }));
  }
  return items;
}

/**
 * How long they have been on the list, in whole months, for the letter to say.
 *
 * Rounded down and never below one, because "you joined 1.8 months ago" is not
 * a sentence and "you joined this month" is not true of somebody sixty days in.
 */
function monthsSince(createdAt, now = Date.now()) {
  const joined = new Date(createdAt).getTime();
  if (!Number.isFinite(joined)) return 0;
  return Math.max(1, Math.floor((now - joined) / (30 * 24 * 3600 * 1000)));
}

/**
 * Send the letter to whoever is owed it.
 *
 * @param {object}   options
 * @param {object}   options.db
 * @param {string}   [options.market]
 * @param {object[]} [options.products]  presented listings for this market, as
 *   the Sunday sweep builds them
 * @param {function} options.sendReactivation
 * @param {function} [options.unsubscribeUrlFor]
 * @param {function} [options.fewerUrlFor]   the "send me fewer" link
 * @returns {object} { sent, skipped, candidates }
 */
async function sendReactivationEmails({
  db,
  market = "us",
  products = [],
  sendReactivation,
  unsubscribeUrlFor = () => "",
  fewerUrlFor = () => "",
  siteOrigin = "https://www.onedailydrop.com",
  now = Date.now(),
  quietDays = QUIET_DAYS,
  limit = 200,
} = {}) {
  if (typeof sendReactivation !== "function") {
    throw new TypeError("sendReactivationEmails needs a sendReactivation function");
  }

  const presented = new Map((Array.isArray(products) ? products : []).map((product) => [Number(product.id), product]));
  const candidates = dormantSubscribers(db, { market, now, quietDays, limit });
  const record = db.prepare(
    "INSERT OR IGNORE INTO subscriber_sequence(subscriber_id,step,sent_at) VALUES(?,?,?)",
  );

  let sent = 0;
  let skipped = 0;

  for (const subscriber of candidates) {
    const items = missedItemsFor(db, subscriber, { presented, market, siteOrigin });
    /*
     * Fewer than three and the subscriber keeps their place in the queue.
     *
     * The letter's whole argument is "here is what you missed"; sending it with
     * one card, or with none, is an email that interrupts somebody to say
     * nothing. A market whose Sundays have not run long enough yet simply does
     * not send this letter, the way the day-three letter waits for a listing
     * worth showing.
     */
    if (items.length < MISSED_ITEMS) {
      skipped += 1;
      continue;
    }

    /* Recorded before sending, like the welcome letters and the digest run:
       a failure after the send costs one reader one letter, while a failure
       before the record sends this one twice. */
    const written = record.run(subscriber.id, REACTIVATION_STEP, iso(now));
    if (!Number(written?.changes || 0)) continue;

    try {
      await sendReactivation({
        email: subscriber.email,
        market,
        items,
        months: monthsSince(subscriber.created_at, now),
        fewerUrl: fewerUrlFor(subscriber),
        unsubscribeUrl: unsubscribeUrlFor(subscriber),
      });
      sent += 1;
    } catch (error) {
      /* The row stays: a bad address is not retried hourly forever. */
      console.error(`[reactivation] ${subscriber.email}: ${error.message}`);
    }
  }

  return { sent, skipped, candidates: candidates.length };
}

module.exports = {
  MISSED_ITEMS,
  QUIET_DAYS,
  REACTIVATION_STEP,
  dormantSubscribers,
  missedItemsFor,
  monthsSince,
  sendReactivationEmails,
};
