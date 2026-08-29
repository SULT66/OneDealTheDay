const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { tavusProductDetails } = require("../src/tavusProductTool");

const start = Date.parse("2026-09-10T20:00:00Z");
const drop = {
  drop_key: "drop_test_drill",
  market: "us",
  title: "Cordless Drill Kit",
  brand: "Example",
  retailer_name: "Verified Retailer",
  image_url: "https://example.com/drill.jpg",
  retail_price: 129.99,
  drop_price: 79.99,
  currency: "USD",
  quantity_total: 20,
  quantity_remaining: 17,
  start_at: new Date(start).toISOString(),
  end_at: new Date(start + 10 * 60 * 1000).toISOString(),
  member_early_access_seconds: 0,
  affiliate_url: "https://retailer.example/buy",
  video_url: "",
  stream_embed_url: "",
  terms: "Limited-time affiliate offer.",
};

const upcoming = tavusProductDetails(drop, start - 60 * 60 * 1000);
assert.strictEqual(upcoming.presentation_allowed, false);
assert.strictEqual(upcoming.product.current_price, null, "Chloe received the price before reveal");
assert.strictEqual(upcoming.product.discount_percent, null, "the discount leaked before reveal");
assert.strictEqual(upcoming.product.buy_url, null, "the buy link opened before the drop");
assert.strictEqual(upcoming.product.inventory_remaining, null, "scarcity was announced before the offer");

const live = tavusProductDetails(drop, start + 60 * 1000);
assert.strictEqual(live.presentation_allowed, true);
assert.strictEqual(live.product.current_price, 79.99);
assert.strictEqual(live.product.regular_price, 129.99);
assert.strictEqual(live.product.discount_percent, 38);
assert.strictEqual(live.product.inventory_remaining, 17);
assert.strictEqual(live.product.buy_url, drop.affiliate_url);
assert(!("delivery" in live.product), "an unverified delivery claim entered Chloe's fact set");
assert(!("warranty" in live.product), "an unverified warranty claim entered Chloe's fact set");
assert(!("rating" in live.product), "an unverified rating entered Chloe's fact set");

const ended = tavusProductDetails(drop, start + 20 * 60 * 1000);
assert.strictEqual(ended.presentation_allowed, false);
assert.strictEqual(ended.product.current_price, null, "an expired price remained sellable");
assert.strictEqual(ended.product.buy_url, null, "an expired buy link remained active");

const none = tavusProductDetails(null, start);
assert.strictEqual(none.verified, false);
assert.strictEqual(none.product, null);

const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
assert(
  /\/api\/integrations\/tavus\/get-product-details/.test(serverSource),
  "the Tavus tool endpoint is missing",
);
assert(
  /secretMatches\(bearer, c\.tavusToolSecret\)/.test(serverSource),
  "the Tavus endpoint is no longer protected by its bearer secret",
);
assert(
  /published=1/.test(serverSource.slice(serverSource.indexOf("/api/integrations/tavus/get-product-details"))),
  "Chloe can read an unpublished draft",
);

console.log("Tavus product disclosure, expiry and endpoint security checks passed.");
