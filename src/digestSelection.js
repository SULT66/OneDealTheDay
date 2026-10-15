/*
 * What goes into the Sunday email.
 *
 * A floor, not a ranking. "The five best things we have" always finds five
 * things, including on a week when nothing is worth sending; "everything at
 * Score 80 or better, up to five" sends four when there are four and nothing
 * when there is nothing. The second is the only one that can be trusted to
 * mean something after a month of it.
 *
 * Measured against the live catalogue on 2026-10-15: 2,713 listings, 98 of
 * them publishing a Score and every one of those at 80 or above. So the floor
 * changes nothing today — nothing lands between 70 and 79 — and it is still
 * the right rule, because it is what stops a thin week from being padded out
 * with whatever came closest.
 *
 * Ninety-eight eligible listings is nineteen Sundays of five with no repeat,
 * before counting anything the refreshes add in the meantime.
 */

/* The published Score an item must reach. The site's own public floor is 70
   (PUBLIC_SCORE_FLOOR in src/ranker.js); this is deliberately higher, because
   an email arrives uninvited and has to earn the interruption. */
const DIGEST_SCORE_FLOOR = 80;

const DIGEST_SIZE = 5;

/*
 * At most two from any one category.
 *
 * Toys & Games holds sixteen of the ninety-eight eligible listings and Tools
 * and Office thirteen each, so ordering by Score alone produces a Sunday that
 * is five board games. The cap costs a point or two of average Score and buys
 * an email that is worth opening by somebody who does not play board games.
 */
const PER_CATEGORY = 2;

/*
 * How long a listing stays used up.
 *
 * Long enough that nobody sees the same thing twice in a season, short enough
 * that a genuinely good listing can return once its price has moved again.
 */
const REPEAT_WINDOW_DAYS = 60;

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const categoryOf = (item) =>
  String(item?.public_category || item?.category || item?.normalized_category || "Other").trim() || "Other";

/**
 * Why this listing is in the email, in the site's own terms.
 *
 * Only what was measured. A listing with no recorded fall says nothing about
 * a fall; the Score is stated as a Score and never as a verdict.
 */
function digestEvidence(item = {}) {
  const reasons = [];
  const drop = Math.round(number(item.tracked_drop_percent));
  const reviews = Math.round(number(item.review_count));
  const rating = number(item.rating);
  const score = item.display_score;

  if (drop > 0) reasons.push(`${drop}% below the highest daily price we recorded`);
  if (rating > 0 && reviews >= 5) reasons.push(`${rating.toFixed(1)}/5 from ${reviews.toLocaleString("en-US")} reviews`);
  if (score != null) reasons.push(`Score ${Math.round(number(score))}/100`);
  return reasons;
}

/**
 * The listings for one Sunday.
 *
 * @param {object[]} products   presented listings, as the compact API returns them
 * @param {object}   [options]
 * @param {Set|Array} [options.recentlySent]  product ids used by a recent digest
 * @param {number}   [options.limit]
 * @param {number}   [options.perCategory]
 * @param {number}   [options.floor]
 * @returns {object[]} up to `limit` listings, highest Score first — and fewer,
 *                     or none at all, when that is all there is.
 */
function chooseDigestItems(products = [], {
  recentlySent = new Set(),
  limit = DIGEST_SIZE,
  perCategory = PER_CATEGORY,
  floor = DIGEST_SCORE_FLOOR,
} = {}) {
  const used = recentlySent instanceof Set ? recentlySent : new Set(recentlySent || []);
  const seen = new Set();

  const candidates = (Array.isArray(products) ? products : [])
    .filter((item) => {
      if (!item) return false;
      /* A card in an email needs somewhere to go and something to show. */
      if (!item.deal_url || !item.image_url) return false;
      if (number(item.current_price) <= 0) return false;
      if (item.display_score == null || number(item.display_score) < floor) return false;
      const id = String(item.id);
      if (used.has(id) || used.has(Number(item.id)) || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    /* Highest Score first, and a stable tie-break so two runs over the same
       catalogue produce the same email. */
    .sort((left, right) => (number(right.display_score) - number(left.display_score))
      || (number(right.tracked_drop_percent) - number(left.tracked_drop_percent))
      || (number(right.review_count) - number(left.review_count))
      || (number(left.id) - number(right.id)));

  const chosen = [];
  const perCategoryCount = new Map();

  /*
   * Spread first: no category takes a third slot while another category still
   * has something to offer. Toys & Games alone holds sixteen of the
   * ninety-eight eligible listings, so without this a Sunday can be five
   * board games — which is the week a reader who does not play board games
   * gets nothing from.
   */
  for (const item of candidates) {
    if (chosen.length >= limit) break;
    const category = categoryOf(item);
    const taken = perCategoryCount.get(category) || 0;
    if (taken >= perCategory) continue;
    perCategoryCount.set(category, taken + 1);
    chosen.push(item);
  }

  /*
   * Then fill the rest, cap set aside, in Score order.
   *
   * Five is the shape the invitation promises, and a slot left empty because
   * the only listing that could fill it shares a category with two others
   * makes a worse email than one with three board games in it. The spread
   * pass still decides the first picks, so the cap shapes every Sunday the
   * catalogue allows it to and yields only when the alternative is a shorter
   * email.
   *
   * The Score floor is never set aside. The email says every listing in it
   * cleared 80, so filling a slot from below that would make the email itself
   * untrue — which is the one thing worth sending four for.
   */
  if (chosen.length < limit) {
    const already = new Set(chosen.map((item) => String(item.id)));
    for (const item of candidates) {
      if (chosen.length >= limit) break;
      if (already.has(String(item.id))) continue;
      chosen.push(item);
    }
  }

  return chosen;
}

/**
 * How many listings showed a discount this week that we could not confirm.
 *
 * The closing line of the email, and the one that says what the site is for.
 * It names nobody: it is a count of listings whose retailer prints a
 * struck-through price while our own sixty days of observations show no fall.
 * "We could not confirm it" is the honest claim; "it is fake" is not one we
 * can make and not one worth a legal argument.
 */
function unconfirmedDiscountCount(products = []) {
  return (Array.isArray(products) ? products : []).filter((item) => {
    const reference = number(item?.original_price);
    const current = number(item?.current_price);
    return reference > current && current > 0 && Math.round(number(item?.tracked_drop_percent)) <= 0;
  }).length;
}

module.exports = {
  DIGEST_SCORE_FLOOR,
  DIGEST_SIZE,
  PER_CATEGORY,
  REPEAT_WINDOW_DAYS,
  chooseDigestItems,
  digestEvidence,
  unconfirmedDiscountCount,
};
