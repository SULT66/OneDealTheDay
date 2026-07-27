const assert = require("assert");
const { priceIntelligence, shouldRecordObservation } = require("../src/priceIntelligence");
const { scoreProduct } = require("../src/ranker");

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
assert.equal(Object.keys(score.breakdown).length, 6);

console.log("Price intelligence and live-product scoring tests passed.");
