/*
 * Every number the site actually holds, in one place.
 *
 * They existed already, and that was the problem: clicks in one admin
 * endpoint, the Live Drop funnel in another, search events in a third, and
 * subscribers, registrations and price watches counted nowhere at all. Asked
 * "how many people came and how many signed up", the honest answer was that it
 * was knowable and nobody could look at it.
 *
 * Written as one query set rather than a dashboard framework because the point
 * is the numbers, and there are about a dozen of them.
 *
 * What this deliberately does NOT claim to know is visitors. Nothing on this
 * site records a page view; the closest thing is the number of distinct
 * browser sessions that produced an event, which undercounts everyone who
 * looked and left. It is labelled as what it is rather than dressed up as
 * traffic, because a made-up top of the funnel makes every rate below it a
 * fiction.
 */

const { MEANINGFUL_REVIEW_COUNT } = require("./productPresentation");

const sinceIso = (days, now = Date.now()) =>
  new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

function overview(db, { days = 30, now = Date.now() } = {}) {
  const since = sinceIso(days, now);
  const one = (sql, ...params) => db.prepare(sql).get(...params) || {};
  const all = (sql, ...params) => db.prepare(sql).all(...params);

  const audience = one(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) AS unsubscribed,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS joined_in_window
     FROM subscribers`,
    since,
  );

  const accounts = one(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS joined_in_window,
       SUM(CASE WHEN google_sub IS NOT NULL THEN 1 ELSE 0 END) AS via_google
     FROM users`,
    since,
  );

  const watches = one(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN notified_at IS NULL THEN 1 ELSE 0 END) AS waiting,
       SUM(CASE WHEN notified_at IS NOT NULL THEN 1 ELSE 0 END) AS told
     FROM price_watches`,
  );

  const saved = one("SELECT COUNT(*) AS total FROM saved_offers");

  /*
   * Outbound clicks split by what they were. A store click and a product click
   * are different products of the site, and lumping them together was how the
   * store links looked like nothing for weeks.
   *
   * An empty session id is not a session.
   *
   * COUNT(DISTINCT session_id) counted the empty string as one, so a week of
   * 4,895 clicks that carried no id at all reported "1 session" — which reads
   * as one visitor and is really "we did not record this". Only the Live Drop
   * panel was attaching an id; every product and store link went out bare
   * (fixed in components/site/ClickAttribution.tsx). Clicks from before that
   * therefore count as unattributed rather than as a person, and the two are
   * reported separately so the gap stays visible instead of averaging into a
   * number that looks fine.
   */
  const clicks = one(
    `SELECT
       COUNT(*) AS total,
       COUNT(DISTINCT NULLIF(session_id, '')) AS sessions,
       SUM(CASE WHEN COALESCE(session_id, '') = '' THEN 1 ELSE 0 END) AS unattributed,
       SUM(CASE WHEN action_type = 'shop_all' THEN 1 ELSE 0 END) AS to_a_shop,
       SUM(CASE WHEN action_type = 'view_deal' THEN 1 ELSE 0 END) AS to_a_product
     FROM clicks
     WHERE clicked_at >= ? AND destination_type = 'retailer'`,
    since,
  );

  const drops = one(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN published = 1 THEN 1 ELSE 0 END) AS published
     FROM live_drops`,
  );

  /*
   * People at every step, not people at one and events at the next.
   *
   * `reached` counted distinct sessions across every drop while the steps under
   * it counted rows, so one person who looked at three drops was one at the top
   * and three below it. The panel then read "7 reached · 16 saw the price",
   * which cannot happen and is the sort of number that makes somebody stop
   * trusting the whole screen.
   *
   * Distinct sessions throughout. The steps are comparable now, and the total
   * is what it always claimed to be: how many different people.
   */
  const dropFunnel = one(
    `SELECT
       COUNT(DISTINCT session_id) AS reached,
       COUNT(DISTINCT CASE WHEN event_type = 'reveal' THEN session_id END) AS saw_the_price,
       COUNT(DISTINCT CASE WHEN event_type = 'buy_click' THEN session_id END) AS went_to_buy
     FROM live_drop_events
     WHERE session_id <> ''`,
  );

  const reminders = one(
    `SELECT
       COUNT(*) AS asked,
       COUNT(reminded_at) AS sent_at_ten_minutes,
       COUNT(reminded_day_before_at) AS sent_a_day_before,
       COUNT(reminded_hour_before_at) AS sent_an_hour_before
     FROM live_drop_reminders`,
  );

  const announcements = one("SELECT COUNT(*) AS sent FROM live_drop_announcements");

  const catalogue = one(
    `SELECT
       COUNT(*) AS listings,
       SUM(CASE WHEN rating > 0 THEN 1 ELSE 0 END) AS with_reviews
     FROM products WHERE status = 'published'`,
  );

  /*
   * The same counts per shop, which is where they mean something.
   *
   * FED Fitness was connected, its feed ran, and its listings landed — none of
   * which can be scored, become the Daily Drop, or reach the shelf of the best
   * right now. Not a bug: the feed carries no review data and no reference
   * price, so there is nothing to score and no saving to state, and the site
   * says so correctly by printing no number. But nothing anywhere said it, so
   * a shop could be signed, ingested and quietly inert, and the only way to
   * find out was to notice its name never appearing.
   *
   * Both columns are things the merchant chooses to send. An Awin feed is
   * assembled column by column, so "this shop sends no reviews" is usually one
   * request away from being fixed — and worth knowing before the next shop is
   * connected on the same terms.
   */
  const shops = all(
    `SELECT
       COALESCE(NULLIF(retailer_name, ''), source, 'unknown') AS shop,
       COUNT(*) AS listings,
       SUM(CASE WHEN rating > 0 AND review_count >= ? THEN 1 ELSE 0 END) AS can_be_scored,
       SUM(CASE WHEN original_price > current_price THEN 1 ELSE 0 END) AS can_state_a_saving
     FROM products
     WHERE status = 'published'
     GROUP BY shop
     ORDER BY listings DESC`,
    MEANINGFUL_REVIEW_COUNT,
  );

  const number = (value) => Math.max(0, Math.round(Number(value) || 0));

  return {
    days,
    since,
    /* Named "sessions that did something", never "visitors". */
    engagedSessions: number(clicks.sessions),
    audience: {
      subscribers: number(audience.active),
      unsubscribed: number(audience.unsubscribed),
      subscribedInWindow: number(audience.joined_in_window),
      accounts: number(accounts.total),
      accountsInWindow: number(accounts.joined_in_window),
      accountsViaGoogle: number(accounts.via_google),
    },
    intent: {
      savedProducts: number(saved.total),
      priceWatches: number(watches.total),
      priceWatchesWaiting: number(watches.waiting),
      priceWatchesTold: number(watches.told),
    },
    outbound: {
      total: number(clicks.total),
      /* Clicks nobody can be attached to. Mostly crawlers walking every
         link, and impossible to tell apart from people until a session id
         rides along. */
      unattributed: number(clicks.unattributed),
      toAProduct: number(clicks.to_a_product),
      toAShop: number(clicks.to_a_shop),
    },
    live: {
      drops: number(drops.total),
      published: number(drops.published),
      reached: number(dropFunnel.reached),
      sawThePrice: number(dropFunnel.saw_the_price),
      wentToBuy: number(dropFunnel.went_to_buy),
      remindersAsked: number(reminders.asked),
      remindersSent:
        number(reminders.sent_at_ten_minutes) +
        number(reminders.sent_a_day_before) +
        number(reminders.sent_an_hour_before),
      announcementsSent: number(announcements.sent),
    },
    catalogue: {
      listings: number(catalogue.listings),
      withReviews: number(catalogue.with_reviews),
      /* Per shop, so a feed that supplies nothing scoreable is visible as soon
         as it lands rather than months later. */
      shops: shops.map((shop) => ({
        shop: String(shop.shop || "unknown"),
        listings: number(shop.listings),
        canBeScored: number(shop.can_be_scored),
        canStateASaving: number(shop.can_state_a_saving),
      })),
    },
    /*
     * Said out loud rather than left as a gap somebody fills in with a guess.
     * A purchase happens on the shop's own checkout and nothing here ever
     * learns about it; the network's report is the only place it exists.
     */
    notMeasuredHere: [
      "Visitors — no page view is recorded anywhere, so the top of the funnel is unknown.",
      "Anyone behind an unattributed click — those carry no session id, so they are counted as clicks and not as people.",
      "Purchases and commission — they happen at the shop; search the network report for the odd- labels.",
    ],
  };
}

module.exports = { overview };
