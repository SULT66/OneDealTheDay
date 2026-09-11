/*
 * One answer per offer, and the cases it has to get right.
 *
 * The rules tested here were not invented for this module — they were spread
 * across the ranker, the presentation layer, the search endpoint, the drop
 * selector and the cards, which is how the same listing came to read 84 in one
 * place and 86 in another. What is new is that there is now one place to ask.
 *
 * Each case below is a sentence the site is either entitled to say or not.
 */
const assert = require("assert");
const { offerStatus } = require("../src/offerStatus");

const hour = 3600 * 1000;
const now = Date.parse("2026-09-11T12:00:00.000Z");
const ago = (hours) => new Date(now - hours * hour).toISOString();

/* A listing with everything: reviews, a seller record, delivery, returns and a
   reference price. This is the shape the whole scale is anchored to. */
const complete = {
  title: "Anker Soundcore Liberty 4 NC wireless earbuds",
  image_url: "https://example.com/earbuds.jpg",
  affiliate_url: "https://www.ebay.com/itm/complete",
  source: "ebay",
  retailer_name: "eBay",
  currency: "USD",
  current_price: 79.99,
  original_price: 129.99,
  checked_at: ago(2),
  rating: 4.58,
  review_count: 276,
  seller_rating: 99.4,
  seller_feedback_count: 41000,
  availability: "In stock",
  shipping_summary: "Free delivery via USPS First Class",
  shipping_cost: 0,
  return_summary: "Returns accepted within 30 days",
  gtin: "00194644101565",
};
const status = (overrides = {}) => offerStatus({ ...complete, ...overrides }, { now });

const reasonsOf = (result) => result.score_missing_reasons.map((entry) => entry.reason);

/* ---------------------------------------------------------------- scoring */

const scored = status();
assert.strictEqual(scored.status, "scored");
assert.ok(scored.score > 0, "a complete listing must carry a score");
assert.deepStrictEqual(scored.score_missing_reasons, []);

/*
 * No reviews at all — the overwhelming majority of the catalogue, and the case
 * the whole three-status system exists for. It is not a bad product; it is a
 * product nobody has told us anything about, and the card has to say which.
 */
const unreviewed = status({ rating: 0, review_count: 0 });
assert.strictEqual(unreviewed.score, null, "a score must never be invented from no reviews");
assert.ok(reasonsOf(unreviewed).includes("no_product_reviews"));
assert.ok(
  !reasonsOf(unreviewed).includes("too_few_product_reviews"),
  "\"no reviews\" and \"too few reviews\" must not both be reported",
);
/* Still four groups of supporting data, so it is not the bottom rung. */
assert.strictEqual(unreviewed.status, "limited_evidence");

/* One to four reviews: an anecdote, and the reason is about the data. */
const barelyReviewed = status({ review_count: 2 });
assert.strictEqual(barelyReviewed.score, null);
assert.deepStrictEqual(reasonsOf(barelyReviewed), ["too_few_product_reviews"]);
assert.strictEqual(barelyReviewed.score_missing_reasons[0].kind, "missing_data");

/*
 * A low rating is knowledge, not absence of it, and must never be reported as
 * "no information" — that would hide a poor product behind a shrug.
 */
const poorlyRated = status({ rating: 3.1 });
assert.strictEqual(poorlyRated.score, null);
assert.deepStrictEqual(reasonsOf(poorlyRated), ["product_rating_below_bar"]);
assert.strictEqual(poorlyRated.score_missing_reasons[0].kind, "below_threshold");

/* An eBay seller is the only thing standing behind an eBay listing. */
assert.deepStrictEqual(
  reasonsOf(status({ seller_rating: 92.0, seller_feedback_count: 41000 })),
  ["seller_record_below_bar"],
);
assert.deepStrictEqual(
  reasonsOf(status({ seller_feedback_count: 12 })),
  ["seller_record_below_bar"],
);
/* The same figure normalised to five rather than published as a percentage. */
assert.strictEqual(status({ seller_rating: 4.97 }).score, scored.score);
/* And the bar applies where it means something: a shop's own feed has no
   seller record to fail. */
assert.ok(status({ source: "feed-newegg", retailer_name: "Newegg", seller_rating: 0, seller_feedback_count: 0 }).score > 0);

/* A refused return is a property of the offer, not missing data. */
const noReturns = status({ return_summary: "Returns not accepted" });
assert.strictEqual(noReturns.score, null);
assert.ok(reasonsOf(noReturns).includes("returns_not_accepted"));
assert.strictEqual(noReturns.returns.allowed, false);

/* ------------------------------------------------------------- three rungs */

/*
 * Retailer Listing is what is left when a feed sends a price and little else —
 * fewer than two groups of supporting data.
 */
const bare = offerStatus({
  title: "FED Fitness Flybird WB7 Adjustable Weight Bench",
  image_url: "https://example.com/bench.jpg",
  affiliate_url: "https://www.fedfitness.com/wb7",
  source: "feed-fed-fitness",
  retailer_name: "FED Fitness",
  currency: "USD",
  current_price: 269.99,
  checked_at: ago(3),
}, { now });
assert.strictEqual(bare.status, "retailer_listing");
assert.strictEqual(bare.score, null);
assert.strictEqual(bare.evidence.group_count, 0);
assert.ok(bare.publishable, "a plain priced listing is still publishable");

/* Two groups is the line between the bottom two rungs. */
assert.strictEqual(
  offerStatus({ ...bare, shipping_summary: "Free delivery", return_summary: "30-day returns" }, { now }).status,
  "limited_evidence",
);

/* ---------------------------------------------------------- what is missing */

/* A listing with no price cannot be drawn as a priced card at all, and the
   blocker is named so the feed can be fixed rather than guessed at. */
const priceless = offerStatus({ ...complete, current_price: 0 }, { now });
assert.strictEqual(priceless.publishable, false);
assert.deepStrictEqual(priceless.publication_blockers, ["price"]);
assert.strictEqual(priceless.score, null, "an unpublishable listing cannot carry a score");

/* -------------------------------------------------------------- the basics */

/* Unknown availability is its own answer. Feeds mostly carry no stock field,
   and presenting silence as "in stock" is the one reading that is never safe. */
assert.strictEqual(status({ availability: "" }).availability, "unknown");
assert.strictEqual(status({ availability: "Out of stock" }).availability, "out_of_stock");
assert.strictEqual(status().availability, "in_stock");

/* Unknown delivery is not free delivery. */
const deliveryUnknown = offerStatus({ ...bare, shipping_summary: "", shipping_cost: null }, { now });
assert.strictEqual(deliveryUnknown.delivery.known, false);
assert.strictEqual(deliveryUnknown.delivery.cost, null);

/*
 * A price from three days ago is still worth showing, with its date. What
 * stops is the percentage computed from it: a discount is a claim about right
 * now, and a stale one is the claim the site cannot make.
 */
const stale = status({ checked_at: ago(72) });
assert.strictEqual(stale.price.is_current, false);
assert.strictEqual(stale.price.age_hours, 72);
assert.ok(stale.price.checked_at, "a stale price still reports when it was taken");
assert.strictEqual(
  stale.price.below_retailer_reference_percent,
  status().price.below_retailer_reference_percent,
  "the gap itself is unchanged; what changes is whether it may be stated",
);

/* The gap is named after what it is measured against, and is absent when the
   shop published nothing to measure against. */
assert.strictEqual(status().price.retailer_reference, 129.99);
assert.strictEqual(status({ original_price: 0 }).price.retailer_reference, null);
assert.strictEqual(status({ original_price: 0 }).price.below_retailer_reference_percent, null);

/* ------------------------------------------------------------- daily drop */

const drop = status();
assert.strictEqual(drop.daily_drop_eligible, true, "the anchor listing must clear the drop's bar");

/* Each additional condition, refused one at a time and named. */
const refuses = (overrides, blocker) => {
  const result = status(overrides);
  assert.strictEqual(result.daily_drop_eligible, false, `${blocker} should have stopped this`);
  assert.ok(result.daily_drop_blockers.includes(blocker), `expected ${blocker}, got ${result.daily_drop_blockers}`);
};
refuses({ rating: 0, review_count: 0 }, "not_scored");
refuses({ gtin: "", upc: "", ean: "", mpn: "", model_number: "" }, "product_not_identifiable");
refuses({ availability: "" }, "availability_not_confirmed");
refuses({ shipping_summary: "", shipping_cost: null }, "delivery_cost_unknown");
refuses({ checked_at: ago(72) }, "price_not_current");
refuses({ current_price: 19.99, original_price: 49.99 }, "price_below_floor");
refuses({ original_price: 84.99 }, "reference_gap_too_small");

/* An empty drop is an honest outcome. Nothing here quietly lowers a bar to
   fill the slot. */
assert.deepStrictEqual(
  status({ current_price: 19.99, original_price: 20.99, availability: "" }).daily_drop_blockers.sort(),
  ["availability_not_confirmed", "price_below_floor", "reference_gap_too_small"],
);

console.log("Offer status, evidence rungs, price freshness and drop eligibility passed.");
