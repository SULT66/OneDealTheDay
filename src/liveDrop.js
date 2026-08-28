/**
 * What state a Live Drop is in, and what a shopper is allowed to see of it.
 *
 * The state is derived from the clock and the stock rather than stored. A
 * status column needs something running to move it, and the moment that
 * process is not running the drop sits at "upcoming" past its own start, or at
 * "live" long after it closed. Deriving it means the page is right even if
 * nothing has touched the database since the drop was created.
 *
 * Pure functions on purpose: the whole state machine can be tested against a
 * fixed clock, which is the only way to be sure a ten minute window that
 * happens once behaves correctly before it happens.
 */

/** The doc's T-05:00: the waiting room opens five minutes before the start. */
const WAITING_ROOM_SECONDS = 5 * 60;

const parseTime = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * upcoming, waiting, live, sold_out or ended.
 *
 * sold_out outranks ended once the drop has opened, because "we sold every
 * one" and "time ran out" are different things to arrive at, and the first is
 * the one worth telling somebody who missed it.
 *
 * `earlyAccessSeconds` lets a Drop Pass member in before the public start. It
 * is a parameter rather than a lookup so the lane can be built and tested now
 * and sold later.
 */
function dropState(drop, now = Date.now(), earlyAccessSeconds = 0) {
  const startAt = parseTime(drop?.start_at);
  const endAt = parseTime(drop?.end_at);
  if (startAt == null || endAt == null) return "ended";

  const opensAt = startAt - Math.max(0, number(earlyAccessSeconds)) * 1000;
  const remaining = number(drop?.quantity_remaining, 0);
  const hasStock = number(drop?.quantity_total, 0) <= 0 || remaining > 0;

  if (now >= opensAt && !hasStock) return "sold_out";
  if (now >= endAt) return "ended";
  if (now >= opensAt) return "live";
  if (now >= startAt - WAITING_ROOM_SECONDS * 1000) return "waiting";
  return "upcoming";
}

/**
 * The saving, as a figure and a percentage.
 *
 * Returns nothing rather than zero when there is no honest comparison to make.
 * A "SAVE $0 (0%)" badge is worse than no badge, and a claimed saving against
 * a retail price nobody can point at is the kind of thing that turns a
 * promotion into a complaint.
 */
function dropSaving(drop) {
  const retail = number(drop?.retail_price, 0);
  const price = number(drop?.drop_price, 0);
  if (!(retail > 0 && price > 0 && retail > price)) return null;
  const amount = Math.round((retail - price) * 100) / 100;
  return { amount, percent: Math.round((amount / retail) * 100) };
}

/**
 * The drop as the browser gets it.
 *
 * `server_now` travels with it so the countdown can run off our clock rather
 * than the visitor's. Half of any audience has a machine minutes out, and a
 * countdown reading from the browser would open the drop early for some people
 * and late for others, which for a ten minute event is the whole event.
 *
 * The price is withheld until the drop opens. That is the mechanic the whole
 * format rests on, and leaking it in the JSON while the page shows a teaser
 * would give it away to anybody who opened developer tools.
 */
function presentDrop(drop, now = Date.now(), { earlyAccessSeconds = 0 } = {}) {
  if (!drop) return null;
  const state = dropState(drop, now, earlyAccessSeconds);
  const startAt = parseTime(drop.start_at);
  const endAt = parseTime(drop.end_at);
  const revealed = state === "live" || state === "sold_out" || state === "ended";
  const saving = revealed ? dropSaving(drop) : null;

  return {
    drop_key: drop.drop_key,
    market: drop.market,
    title: drop.title,
    brand: drop.brand,
    retailer_name: drop.retailer_name,
    image_url: drop.image_url,
    currency: drop.currency,
    retail_price: number(drop.retail_price, 0) || null,
    /* Before the start this is deliberately null, not the real number. */
    drop_price: revealed ? number(drop.drop_price, 0) || null : null,
    saving,
    quantity_total: number(drop.quantity_total, 0),
    quantity_remaining: Math.max(0, number(drop.quantity_remaining, 0)),
    state,
    start_at: drop.start_at,
    end_at: drop.end_at,
    /* Seconds, not a target timestamp, so a browser with a wrong clock still
       counts down the right length of time. */
    seconds_until_start: startAt == null ? null : Math.max(0, Math.round((startAt - now) / 1000)),
    seconds_until_end: endAt == null ? null : Math.max(0, Math.round((endAt - now) / 1000)),
    member_early_access_seconds: number(drop.member_early_access_seconds, 0),
    /* Only once it can actually be used: a live link before the start is an
       invitation to buy at the ordinary price and blame us for the difference. */
    affiliate_url: state === "live" ? drop.affiliate_url || "" : "",
    terms: drop.terms || "",
    server_now: new Date(now).toISOString(),
  };
}

module.exports = {
  WAITING_ROOM_SECONDS,
  dropSaving,
  dropState,
  presentDrop,
};
