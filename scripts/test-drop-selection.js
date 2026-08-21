/**
 * Guards for the three defects that made the Daily Drop repeat itself.
 *
 * Every assertion here fails against the code as it stood on 2026-08-21, so
 * each one is a real trap rather than a restatement of current behaviour:
 *
 *   1. Awin feeds produced shipping_cost = null for every row, because
 *      affiliateFeed.js only ever read a delivery *description* and never a
 *      delivery *charge*. isDailyPickEligible refuses an unknown landed cost,
 *      so 2486 of 2865 catalog products could never become candidates and the
 *      drop was silently eBay-only.
 *   2. Nothing stopped a no-name product with no rating, no reviews and no
 *      barcode from clearing the evidence bar, because that bar is mostly
 *      satisfied by things we write down ourselves.
 *   3. selectDailyProducts ended with [...fresh, ...fallback].slice(0, 10),
 *      which refilled the day from recently-shown products the moment fresh
 *      ones ran out — overruling the no-repeat rule one line after applying it.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { normalize } = require("../src/providers/affiliateFeed");
const { isDailyPickEligible, exactMatchKey } = require("../src/ranker");
const { feedDefinitions } = require("../src/retailerCatalog");

const market = { code: "us", currency: "USD" };

const baseRecord = {
  id: "sku-1",
  title: "Standing desk converter",
  price: "199.00",
  currency: "USD",
  image_url: "https://images.test/desk.jpg",
  affiliate_url: "https://click.test/desk",
  availability: "In stock",
  return_summary: "30 day returns",
};

const merchant = { retailerId: "tribesigns", retailerName: "Tribesigns" };

/* ---------------------------------------------- 1. delivery charge from feed */

const fromFeed = normalize({ ...baseRecord, delivery_cost: "12.50" }, merchant, market, 0, {});
assert.strictEqual(
  fromFeed.shipping_cost,
  12.5,
  "a delivery_cost column in the feed must become a numeric shipping_cost",
);
assert.strictEqual(
  fromFeed.landed_cost,
  211.5,
  "landed cost must be price plus delivery once delivery is known",
);

const freeFromFeed = normalize({ ...baseRecord, shipping_cost: "0" }, merchant, market, 0, {});
assert.strictEqual(
  freeFromFeed.shipping_cost,
  0,
  "zero delivery is a known cost, not a missing one",
);

/* A number in the feed must not end up printed as the delivery description. */
assert(
  !/^\s*12\.50\s*$/.test(String(fromFeed.shipping_summary)),
  "a bare number must never be shown to a visitor as the delivery description",
);

/* ------------------------------------- 2. unknown stays unknown, not free */

const unconfigured = normalize(baseRecord, merchant, market, 0, {});
assert.strictEqual(
  unconfigured.shipping_cost,
  null,
  "with no delivery column and no configured terms, delivery must stay unknown — " +
  "assuming free delivery on a merchant that charges is how the site starts lying",
);
assert.strictEqual(unconfigured.landed_cost, null, "landed cost is unknowable without delivery");
assert.strictEqual(
  isDailyPickEligible({ ...unconfigured, rating: 4.8, review_count: 900 }),
  false,
  "a product with an unknown landed cost must not be a drop candidate",
);

/* ------------------------------------- 3. merchant terms fill the gap */

const withTerms = { ...merchant, shipping: { flat: 6.95, freeOver: 100 } };
const cheap = normalize({ ...baseRecord, price: "40.00" }, withTerms, market, 0, {});
const dear = normalize({ ...baseRecord, price: "150.00" }, withTerms, market, 0, {});
assert.strictEqual(cheap.shipping_cost, 6.95, "below the free-delivery threshold the flat charge applies");
assert.strictEqual(dear.shipping_cost, 0, "at or above the threshold delivery is free");
assert.strictEqual(cheap.shipping_cost_from_policy, true, "a policy-derived charge must be marked as such");
assert(
  /Tribesigns/.test(cheap.shipping_summary),
  "a policy-derived charge must name the merchant whose terms it came from, so it " +
  "is never mistaken for a quote against this particular item",
);

const alwaysFree = normalize(baseRecord, { ...merchant, shipping: { flat: 0 } }, market, 0, {});
assert.strictEqual(alwaysFree.shipping_cost, 0, '{"flat":0} means delivery is always free');

/* Terms are configurable per feed without touching code. */
const configured = feedDefinitions({
  AFFILIATE_FEED_TRIBESIGNS_US_URL: "https://feed.test/tribesigns.csv",
  AFFILIATE_FEED_TRIBESIGNS_US_SHIPPING_JSON: '{"flat":0}',
}).find(definition => definition.retailerId === "tribesigns");
assert.deepStrictEqual(
  configured.shipping,
  { flat: 0, freeOver: null },
  "delivery terms must be settable per feed through the environment",
);
assert.throws(
  () => feedDefinitions({
    AFFILIATE_FEED_TRIBESIGNS_US_URL: "https://feed.test/tribesigns.csv",
    AFFILIATE_FEED_TRIBESIGNS_US_SHIPPING_JSON: "{}",
  }),
  /flat/,
  "malformed delivery terms must fail loudly at startup, not silently do nothing",
);

/* An unconfigured merchant keeps the safe default. */
const bare = feedDefinitions({
  AFFILIATE_FEED_GIFTLAB_US_URL: "https://feed.test/giftlab.csv",
}).find(definition => definition.retailerId === "giftlab");
assert.strictEqual(bare.shipping, null, "delivery terms must not be invented for an unconfigured merchant");

/* -------------------------------------------- 4. the drop's identity floor */

const identified = {
  title: "Standing desk converter",
  image_url: "https://images.test/desk.jpg",
  affiliate_url: "https://click.test/desk",
  source: "feed-tribesigns",
  market: "us",
  currency: "USD",
  current_price: 199,
  original_price: 259,
  shipping_cost: 0,
  shipping_summary: "Free delivery",
  return_summary: "30 day returns",
  availability: "In stock",
  seller_name: "Tribesigns",
  gtin: "00012345678905",
};
const anonymous = { ...identified, gtin: "", upc: "", ean: "", mpn: "", model_number: "", product_key: "" };

assert(exactMatchKey(identified), "the fixture must actually carry a usable identifier");
assert.strictEqual(exactMatchKey(anonymous), "", "the anonymous fixture must carry none");

assert.strictEqual(
  isDailyPickEligible(anonymous),
  true,
  "the identity floor must stay OFF by default — the same function is the editorial " +
  "floor for showing a public score on a product page, and only a small minority of " +
  "the catalog carries an identifier",
);
assert.strictEqual(
  isDailyPickEligible(anonymous, { requireProductIdentity: true }),
  false,
  "a drop candidate without a barcode or part number cannot be checked against any " +
  "outside source, so it must not reach the drop",
);
assert.strictEqual(
  isDailyPickEligible(identified, { requireProductIdentity: true }),
  true,
  "an identifiable product that clears every other gate must still qualify",
);

/* ------------------------------- 5. a short day rather than a repeated one */

/* Comments are stripped first. These assertions describe what the code does,
   and the comments in refresh.js quote the very lines being banned in order to
   explain why — without this, the guard would trip on its own documentation. */
const refreshSource = fs.readFileSync(path.join(__dirname, "..", "src", "refresh.js"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

assert(
  !/\[\s*\.\.\.fresh\s*,\s*\.\.\.fallback\s*\]/.test(refreshSource),
  "the daily selection must not top itself up from recently-shown products: that line " +
  "is what put one eBay item in the drop on 15 of 19 days while the no-repeat rule " +
  "appeared to be working",
);
assert(
  /NO_REPEAT_DAYS\s*=\s*14/.test(refreshSource),
  "the no-repeat window must be 14 days",
);
assert(
  /daysAgoDate\(timezone,\s*NO_REPEAT_DAYS\)/.test(refreshSource),
  "the no-repeat query must use the configured window rather than a hard-coded number",
);
assert(
  /DAILY_PICK_TARGET\s*=\s*10/.test(refreshSource),
  "a full drop is ten picks",
);

/* Eligibility must be applied before any cap, or qualifying products are thrown
   away unseen: score and eligibility are largely uncorrelated, so a top-60-by-
   score window discarded most of what qualified. */
assert(
  !/selectUniqueProducts\([^)]*\)\.slice\(0,\s*60\)[\s\S]{0,200}?filter\([^)]*isDailyPickEligible/.test(refreshSource),
  "drop candidates must be filtered for eligibility before any cap is applied",
);
assert(
  /requireProductIdentity:\s*true/.test(refreshSource),
  "the refresh must opt into the identity floor for drop candidates",
);

/* ------------------------------- 6. the archive must not link to 404s */

const catalogSource = fs.readFileSync(path.join(__dirname, "..", "lib", "catalog.ts"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");

/* A past pick can stop being reachable two ways, and the archive hit both:
   the product gets archived (/deal/:id and /go/:id require status='published'),
   or it is merged away as a duplicate offer and disappears from the catalog the
   deal page reads. Half of one market's archived picks were dead links. */
assert(
  /available:\s*stillLive/.test(serverSource),
  "the archive API must mark picks whose product is no longer published",
);
assert(
  /catalogIds\.has\(String\(pick\.id\)\)/.test(catalogSource),
  "the archive must cross-check every pick against the catalog the deal page reads, " +
  "or a deduplicated-away offer is linked to a 404",
);
assert(
  /unavailable=\{!pick\.available\}/.test(
    fs.readFileSync(path.join(__dirname, "..", "app", "[market]", "archive", "page.tsx"), "utf8"),
  ),
  "the archive page must render unreachable picks without a link",
);

console.log("Drop selection guards passed: delivery cost, identity floor, no-repeat window, archive links.");
