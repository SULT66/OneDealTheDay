const assert = require("assert");
const { priceIntelligence, shouldRecordObservation } = require("../src/priceIntelligence");
const { rankProducts, scoreProduct } = require("../src/ranker");

const now = new Date("2026-07-27T12:00:00Z");
const one = priceIntelligence([
  { price: 24.99, currency: "USD", observed_at: "2026-07-27T01:00:00Z" }
], now.getTime());
assert.equal(one.day30.sufficient, false, "one observation must not support a 30-day-low claim");

const twoDays = priceIntelligence([
  { price: 29.99, currency: "USD", observed_at: "2026-07-26T01:00:00Z" },
  { price: 24.99, currency: "USD", observed_at: "2026-07-27T01:00:00Z" }
], now.getTime());
assert.equal(twoDays.day30.sufficient, true);
assert.equal(twoDays.day30.low, 24.99);

assert.equal(shouldRecordObservation(
  { price: 24.99, currency: "USD", observed_at: "2026-07-26T01:00:00Z" },
  24.99,
  "USD",
  now
), true, "an unchanged price must still be recorded on a new day");
assert.equal(shouldRecordObservation(
  { price: 24.99, currency: "USD", observed_at: "2026-07-27T01:00:00Z" },
  24.99,
  "USD",
  now
), false, "an unchanged price must not create duplicate same-day samples");

const score = scoreProduct({
  source: "rainforest",
  current_price: 24.99,
  original_price: 39.99,
  average_30_day_price: 34.99,
  lowest_30_day_price: 24.99,
  price_history_observation_count: 20,
  price_history_distinct_days: 20,
  rating: 4.7,
  review_count: 2500,
  retailer_name: "Amazon",
  seller_name: "Example seller",
  availability: "In stock",
  shipping_summary: "Free delivery",
  return_summary: "30-day returns",
  source_rank: 1
});
assert(score.total >= 70 && score.total <= 100, `strong real offer should score credibly, received ${score.total}`);
assert.equal(score.breakdown.model, "current-offer-v2");

const newListing = {
  source: "ebay",
  current_price: 26.99,
  rating: 4.68,
  review_count: 45,
  retailer_name: "eBay",
  seller_name: "established-seller",
  seller_rating: 4.99,
  availability: "In stock",
  shipping_summary: "USD 3.99 shipping",
  return_summary: "Returns not accepted",
  source_rank: 5
};
const newListingScore = scoreProduct(newListing);
assert(newListingScore.total >= 68 && newListingScore.total <= 82,
  `a strong new listing without price history should have a credible score, received ${newListingScore.total}`);
assert.equal(newListingScore.breakdown.price_quality, 20,
  "missing price history must use a neutral current-price score instead of zero");

const historyChanged = scoreProduct({
  ...newListing,
  average_30_day_price: 999,
  average_90_day_price: 1200,
  lowest_30_day_price: 1,
  lowest_90_day_price: 1,
  price_history_observation_count: 90,
  price_history_distinct_days: 90
});
assert.equal(historyChanged.total, newListingScore.total,
  "internal price history must not change the public OneDailyDrop Score");

const comparableOffers = rankProducts([29.99, 24.99, 34.99].map((price, index) => ({
  external_id: `matching-offer-${index}`,
  product_key: "gtin:012345678905",
  title: `Matching product offer ${index}`,
  image_url: `https://i.ebayimg.com/matching-${index}.jpg`,
  affiliate_url: `https://www.ebay.com/itm/${index}?campid=5339179772`,
  ...newListing,
  current_price: price,
  currency: "USD"
})), 3, { minimumScore: 0, minimumRating: 0, minimumReviews: 0, currency: "USD" });
assert.equal(comparableOffers[0].current_price, 24.99,
  "the best-priced matching current offer should rank first");
assert(comparableOffers[0].score_breakdown.price_quality > 20,
  "a below-median matching current offer must earn more than the neutral price score");
assert(scoreProduct({...newListing, comparable_offer_count:3, comparable_median_price:29.99}).breakdown.price_quality >
  scoreProduct({...newListing, current_price:34.99, comparable_offer_count:3, comparable_median_price:29.99}).breakdown.price_quality,
"matching current offers must affect price quality without using price history");

const [ranked] = rankProducts([{
  external_id: "trust-reason-test",
  title: "Verified test product",
  image_url: "https://i.ebayimg.com/test.jpg",
  affiliate_url: "https://www.ebay.com/itm/1?campid=5339179772",
  ...{
    source: "ebay",
    currency: "USD",
    current_price: 24.99,
    original_price: 39.99,
    rating: 4.7,
    review_count: 2500,
    retailer_name: "eBay",
    seller_name: "internal-seller-id",
    seller_rating: 4.95,
    availability: "In stock",
    shipping_summary: "Free delivery",
    return_summary: "30-day returns",
    source_rank: 1
  }
}], 1, { minimumScore: 0, minimumRating: 0, minimumReviews: 0, currency: "USD" });
assert(!ranked.selection_reason.includes("missing evidence"));
assert(!ranked.selection_reason.includes("/100"));
assert(!ranked.selection_reason.includes("internal-seller-id"));

console.log("Price intelligence and live-product scoring tests passed.");
