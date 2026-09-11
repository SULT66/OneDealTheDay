const assert = require("assert");
const { categoryLabel } = require("../src/i18n");
const { presentProduct, publicOneDailyDropScore, PUBLIC_SCORE_FLOOR } = require("../src/productPresentation");

/*
 * These three moved when the band did. It used to run 82 to 95, so a
 * just-qualified pick started at 82 and every score the site printed began
 * with an 8 or a 9 — see the evidence-ceiling section further down for what
 * that cost. The floor is 70 now, and the top of the range is set by what is
 * actually known about the listing.
 */
assert.strictEqual(publicOneDailyDropScore(60, 55), 70, "a just-qualified pick must start at the floor");
assert.strictEqual(publicOneDailyDropScore(75, 80), 84, "a strong pick must land well clear of the floor");
assert.strictEqual(publicOneDailyDropScore(90, 90), 95, "an exceptional pick with no stated evidence limit must reach 95");
assert.strictEqual(publicOneDailyDropScore(59.9, 100), null, "a weak candidate must not be cosmetically promoted");
assert.strictEqual(publicOneDailyDropScore(100, 54.9), null, "sparse evidence must block a public score");

const fixture = {
  title: "Useful pet grooming tool",
  image_url: "https://example.com/pet-tool.jpg",
  affiliate_url: "https://example.com/pet-tool",
  source: "ebay",
  /* Every product a provider stores carries this; the fixture did not, which
     is why the sentence below could say "eBay" for years without anyone
     noticing it said so on Newegg pages too. */
  retailer_name: "eBay",
  market: "fr",
  category: "pet supplies",
  current_price: 47.62,
  currency: "EUR",
  checked_at: "2026-08-03T00:15:10Z",
  rating: 0,
  review_count: 0,
  seller_name: "sit3203",
  seller_rating: 4.99,
  seller_feedback_count: 12000,
  shipping_summary: "Free shipping via Autre mode d'envoi",
  return_summary: "30 calendar days, seller-paid return shipping",
  availability: "In stock",
  score: 31,
  score_breakdown: JSON.stringify({
    price_quality: 1,
    product_quality: 0,
    review_confidence: 0,
    seller_reliability: 15,
    demand_usefulness: 5,
    shipping_returns: 10
  })
};

const french = presentProduct(fixture, "fr");
assert.strictEqual(french.display_category, "Produits pour animaux");
assert.strictEqual(french.display_shipping_summary, "Livraison gratuite via Autre mode d'envoi");
assert.strictEqual(french.display_return_summary, "Retours acceptés sous 30 jours ; frais de retour payés par le vendeur");
assert.strictEqual(french.display_availability, "En stock");
assert.strictEqual(french.display_badge, "VENDEUR ÉTABLI");
assert(french.display_selection_reason.includes("eBay n’a fourni aucune note produit"));
/* The same listing sold by another shop must not credit eBay for the missing
   rating. Newegg's feed carries no ratings at all, so this sentence appears on
   over half the catalogue. */
const newegg = presentProduct({...fixture, source: "newegg", retailer_name: "Newegg"}, "en");
assert(
  newegg.display_selection_reason.includes("Newegg did not provide a product rating"),
  `A Newegg listing still credits the wrong shop: ${newegg.display_selection_reason}`,
);
assert(
  !newegg.display_selection_reason.includes("eBay"),
  "eBay is still named on a listing that did not come from eBay",
);
assert(!french.display_selection_reason.includes("31/100"));
assert(!french.display_selection_reason.includes("Selected with"));
assert(!french.display_selection_reason.includes("sit3203"));
assert(french.evidence_count >= 4);
assert.strictEqual(french.display_score, null, "an offer below the editorial floor must not expose a weak consumer-facing score");
assert.strictEqual(french.display_evidence_confidence, 40, "evidence coverage must be reported separately from the Deal Score");
assert.strictEqual(french.display_score_label, "Score OneDailyDrop");
assert.strictEqual(french.display_product_rating, "");
assert.strictEqual(french.display_seller_rating, "99,8 % d’avis positifs");
assert(french.display_seller_feedback.includes("12 000") || french.display_seller_feedback.includes("12 000"));

const correctedSnapshot = presentProduct({
  ...fixture,
  drop_score: 77,
  drop_score_model: "current-offer-v7",
  drop_price: 44.62,
  evidence_confidence: 70,
  score_breakdown: JSON.stringify({
    model:"current-offer-v7",
    price_quality:20,
    product_quality:0,
    review_confidence:0,
    seller_reliability:15,
    demand_usefulness:5,
    shipping_returns:10
  })
}, "fr");
/* 83 rather than 89 since the band moved from 82-95 down to 70-95; the point
   of the assertion is that a snapshot is scored by the calibration and not by
   its stored raw total. */
assert.strictEqual(
  correctedSnapshot.display_score_at_selection,
  83,
  "a qualified snapshot must use the calibrated public score",
);
/*
 * The snapshot moved out of display_score, and that is the fix for a bug a
 * reviewer found in minutes: display_score preferred the snapshot whenever one
 * existed, so a listing that had once been a daily pick read 84 in search and
 * 86 on its own page — one field, one label, two numbers.
 *
 * One field, one meaning. A listing scores the same whether or not it was ever
 * chosen.
 */
assert.strictEqual(
  correctedSnapshot.display_score,
  presentProduct(fixture, "fr").display_score,
  "display_score still changes depending on whether the listing was once a daily pick",
);

const legacySnapshot = presentProduct({...fixture, drop_score:31, drop_price:44.62}, "fr");
assert.notStrictEqual(legacySnapshot.display_score, 31, "a legacy archive snapshot must not expose the obsolete low score");

const german = presentProduct({...fixture, market:"de", category:"car accessories"}, "de");
assert.strictEqual(german.display_category, "Auto");
assert(german.display_shipping_summary.startsWith("Kostenlose Lieferung"));
assert(german.display_return_summary.startsWith("Rückgabe innerhalb von 30 Tagen"));
assert.strictEqual(german.display_score_at_selection_label, "OneDailyDrop-Score bei Auswahl");

const spanish = presentProduct({...fixture, market:"us", category:"office gadgets"}, "es");
assert.strictEqual(spanish.display_category, "Oficina");
assert(spanish.display_shipping_summary.startsWith("Entrega gratuita"));
assert(spanish.display_selection_reason.includes("eBay no facilitó una valoración del producto"));

assert.strictEqual(categoryLabel("Electronics", "fr"), "Électronique");
assert.strictEqual(categoryLabel("Home & Kitchen", "de"), "Wohnen und Küche");


/* ------------------------------------------ a saving is a claim about today */

/*
 * A shopper found an eBay backpack listed here at $79.95 under a badge reading
 * "59% below reference". The seller had raised it to $99.95; our price was two
 * days old, because eBay's American refresh had failed five runs in a row and,
 * even when it succeeds, only re-prices what its keyword rotation happens to
 * rediscover. Of 215 listings carrying a discount badge, 92 were computed from
 * a price older than a day.
 *
 * The price itself may be stale and still be worth showing, with its date. The
 * arithmetic performed on it may not: a percentage off is a claim about right
 * now.
 */
const { presentProduct: present } = require("../src/productPresentation");

const listing = (hoursAgo) => ({
  id: 1,
  title: "Oakley Icon RC Backpack Travel Pack",
  market: "us",
  currency: "USD",
  current_price: 79.95,
  original_price: 195,
  retailer_name: "eBay",
  checked_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
});

const freshly = present(listing(1), "en");
assert.strictEqual(freshly.display_price_is_current, true, "a price checked an hour ago is treated as out of date");
assert(freshly.display_save_label, "a freshly checked price stopped showing its saving");

const yesterday = present(listing(50), "en");
assert.strictEqual(yesterday.display_price_is_current, false, "a price two days old is presented as current");
assert.strictEqual(
  yesterday.display_save_label,
  "",
  "a saving is still worked out from a price nobody has confirmed in two days",
);
assert.strictEqual(yesterday.display_off_label, "", "the percentage-off pill survives on a stale price");
/* The price itself stays. Withholding it would leave the page saying nothing
   at all about what the thing costs, which helps nobody. */
assert(yesterday.display_current_price, "the last known price was withheld along with the saving");

/* Nothing to go on is not the same as recently checked. */
assert.strictEqual(
  present({...listing(1), checked_at: ""}, "en").display_price_is_current,
  false,
  "a listing with no check date at all is treated as freshly checked",
);



/* ------------------------------------------ the score has to mean something */

/*
 * "Why does a shopping platform that claims to check product quality, review
 * confidence and price signal give an unknown item with no reviews 94/100?"
 *
 * Because the public band was 82 to 95, so every score began with an 8 or a 9.
 * Of 1,141 listings showing a score, 1,111 had no product reviews and 136 of
 * those scored 90 or better. A car phone holder at $8.99, no reviews, no price
 * history, was published at 94.
 *
 * The evidence now sets the top of the band and the offer decides where inside
 * it the listing lands. Capping was tried first and was the same fault wearing
 * a different number: 1,119 listings piled onto exactly 74.
 */

const strong = { hasReviews: true, hasStatedDiscount: true };
const thin = { hasReviews: false, hasStatedDiscount: false };

/* Same offer, same confidence, different evidence behind it. */
const wellEvidenced = publicOneDailyDropScore(95, 95, 1, strong);
const unevidenced = publicOneDailyDropScore(95, 95, 1, thin);
assert(wellEvidenced > unevidenced, "evidence no longer raises the ceiling a listing can reach");
/*
 * No reviews, no number. Lowering the ceiling was half a fix and the other
 * half showed on the page: 147 of 168 scores sat on listings with no reviews,
 * and the "Best right now" grid filled with 67s under a heading calling them
 * the best on the site. Wrong at 67 for the same reason it was wrong at 94.
 */
assert.strictEqual(
  unevidenced,
  null,
  "a listing with nobody's reviews behind it is given a number again",
);
assert.strictEqual(
  publicOneDailyDropScore(95, 95, 1, { hasReviews: false, hasStatedDiscount: true }),
  null,
  "a verified saving alone produces a score, though the card already states the saving",
);
assert(wellEvidenced >= 90, "a fully evidenced, excellent offer can no longer reach the top of the range");

/*
 * Scaled, not capped, among the listings that do get a number. Two reviewed
 * listings with different offers must not land on the same score — capping was
 * the first attempt and piled 1,119 listings onto exactly 74.
 */
assert(
  publicOneDailyDropScore(95, 95, 1, strong) > publicOneDailyDropScore(95, 60, 0.5, strong),
  "every scored listing lands on the same number again, which is what a flat 94 was",
);

/* An archived selection replays the score it was given on the day. Marking it
   down retrospectively would rewrite history. */
assert.strictEqual(
  publicOneDailyDropScore(95, 95, 1),
  publicOneDailyDropScore(95, 95, 1, null),
  "a stored score is re-judged against evidence the snapshot never carried",
);

/*
 * Two glowing reviews is an anecdote, not a verdict.
 *
 * Copied out of the live catalogue on 5 September 2026 rather than invented,
 * because the editorial gate this has to pass reads a dozen fields and a
 * fixture written to suit the assertion would sail through a gate the real
 * thing does not.
 */
const realListing = {
  id: 228438,
  title: 'Cat Tree Tower 55" STURDY Activity Center Large Playing House Condo',
  market: "us",
  currency: "USD",
  current_price: 46.19,
  retailer_name: "eBay",
  source: "ebay",
  image_url: "https://i.ebayimg.com/images/g/fP4AAOSwakZhtwws/s-l1600.jpg",
  affiliate_url: "https://www.ebay.com/itm/264715047925?campid=5339179772",
  availability: "In stock",
  checked_at: new Date().toISOString(),
  rating: 4.66,
  review_count: 71,
  seller_rating: 4.98,
  seller_feedback_count: 15983,
  score: 50.8,
  evidence_confidence: 100,
  shipping_summary: "Free delivery",
  shipping_cost: 0,
  return_summary: "Returns accepted within 60 days",
  public_category: "Pet Supplies",
  normalized_category: "Pet Supplies",
};

const verdict = present(realListing, "en").display_score;
const anecdote = present({ ...realListing, rating: 5, review_count: 2 }, "en").display_score;
assert(verdict > 0, "the real listing this compares against stopped scoring at all");
assert(
  verdict > anecdote,
  `a listing with two reviews scored ${anecdote} against ${verdict} for one carrying seventy-one`,
);



/* Every number the site is willing to print has reviews behind it, so the
   lowest it can be is well clear of the range that reads as a bad mark. */
assert(
  publicOneDailyDropScore(60, 55, 0.45, { hasReviews: true, hasStatedDiscount: false }) >= 70,
  "a scored listing can show a number a shopper reads as a failing grade",
);
/* And the floor itself has to stay out of that range, since it is the lowest
   number the site can print. 67 under a heading reading "Best right now" is
   what this is here to prevent coming back. */
assert(PUBLIC_SCORE_FLOOR >= 70, "the lowest printable score is back in the range that reads as a bad mark");

console.log("Localized product presentation and trust messaging passed.");
