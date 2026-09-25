/*
 * The comparison fetched from eBay by barcode (src/comparables.js).
 *
 * The catalogue holds 1,705 barcodes and not one product that appears in two
 * of our shops, so every comparison on the site has to be gone and fetched.
 * That makes two things worth pinning: what counts as a match (a barcode, and
 * nothing that merely looks similar), and what happens when eBay stops
 * answering — the refresh that keeps prices current spends from the same
 * allowance, and it must not be starved by a nice-to-have.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

class TestDatabase {
  constructor(filename) { this.database = new DatabaseSync(filename); }
  pragma(value) { this.database.exec(`PRAGMA ${value}`); }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => statement.run(...params),
    };
  }
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
}
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-comparables-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const {
  barcodeOf,
  comparableFor,
  pickComparable,
  productsNeedingComparables,
  refreshComparables,
  saveComparable,
} = require("../src/comparables");

/* ------------------------------------------------------- the barcode */

assert.strictEqual(barcodeOf({ gtin: "0885909950805" }), "0885909950805");
assert.strictEqual(barcodeOf({ upc: " 885909950805 " }), "885909950805");
assert.strictEqual(barcodeOf({ ean: "4006381333931" }), "4006381333931");
assert.strictEqual(barcodeOf({ gtin: "", upc: "", ean: "" }), "");
assert.strictEqual(barcodeOf({ gtin: "N/A" }), "", "a word is not a barcode");
assert.strictEqual(barcodeOf({ gtin: "12345" }), "", "five digits is not a barcode");

/* ------------------------------------------------ which listing wins */

const listing = (id, price, extra = {}) => ({
  itemId: id,
  title: `Listing ${id}`,
  price: { value: String(price), currency: "USD" },
  buyingOptions: ["FIXED_PRICE"],
  condition: "New",
  itemAffiliateWebUrl: `https://www.ebay.com/itm/${id}`,
  ...extra,
});

assert.strictEqual(pickComparable([]), null);
assert.strictEqual(pickComparable(null), null, "no answer is not a match");

/* The cheapest that can actually be bought today. */
const cheapest = pickComparable([listing("a", 90), listing("b", 42), listing("c", 75)]);
assert.strictEqual(cheapest.item_id, "b");
assert.strictEqual(cheapest.price, 42);

/* Delivery counts: a $30 listing with $20 postage is not cheaper than $42. */
const withShipping = pickComparable([
  listing("cheap", 30, { shippingOptions: [{ shippingCost: { value: "20.00" } }] }),
  listing("fair", 42, { shippingOptions: [{ shippingCost: { value: "0.00" } }] }),
]);
assert.strictEqual(withShipping.item_id, "fair", "postage was ignored");

/* An auction is not a price anybody can pay now, and used is not the same
   offer as the new one it would be compared against. */
assert.strictEqual(pickComparable([listing("auction", 10, { buyingOptions: ["AUCTION"] })]), null);
assert.strictEqual(pickComparable([listing("used", 10, { condition: "Used" })]), null);
assert.strictEqual(pickComparable([listing("free", 0)]), null, "a listing with no price is not a comparison");

/* The rating comes across with it, and belongs to that listing. */
const rated = pickComparable([
  listing("r", 50, { primaryProductReviewRating: { averageRating: "4.6", reviewCount: "231" } }),
]);
assert.strictEqual(rated.rating, 4.6);
assert.strictEqual(rated.review_count, 231);

/* ------------------------------------------------------ the sweep */

const now = Date.parse("2026-09-25T00:00:00Z");
const insert = db.prepare(`
  INSERT INTO products(id,market,source,external_id,title,current_price,currency,status,gtin,affiliate_url,image_url,updated_at,checked_at,first_seen_at,last_seen_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const row = (id, source, gtin) => insert.run(
  id, "us", source, `${source}:${id}`, `Product ${id}`, 99.99, "USD", "published", gtin,
  "https://example.com/go", "https://example.com/i.jpg",
  "2026-09-01T00:00:00Z", "2026-09-24T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-24T00:00:00Z",
);
row(1, "newegg", "0885909950805");
row(2, "newegg", "4006381333931");
row(3, "ebay", "0885909950805");
row(4, "feed-giftlab", "");

const due = productsNeedingComparables(db, { limit: 10, market: "us", now });
assert.deepStrictEqual(due.map((product) => product.id), [1, 2], "eBay's own listings and barcode-less rows were asked about");

/* eBay answers for one and has nothing for the other. */
const calls = [];
const client = {
  async searchByGtin(gtin) {
    calls.push(gtin);
    return gtin === "0885909950805"
      ? [listing("match", 79.5, { primaryProductReviewRating: { averageRating: "4.4", reviewCount: "58" } })]
      : [];
  },
};
(async () => {
  const summary = await refreshComparables(db, { client, market: { code: "us", countryCodes: ["US"] }, limit: 10, now });
  assert.deepStrictEqual(summary, { checked: 2, matched: 1, failed: 0, stopped: null });
  assert.deepStrictEqual(calls, ["0885909950805", "4006381333931"]);

  const found = comparableFor(db, 1);
  assert.strictEqual(found.price, 79.5);
  assert.strictEqual(found.source, "ebay");
  assert.strictEqual(found.review_count, 58);
  assert.strictEqual(comparableFor(db, 2), null, "a product with no match must not carry one");

  /* Asked once, not asked again tomorrow. */
  assert.deepStrictEqual(
    productsNeedingComparables(db, { limit: 10, market: "us", now: now + 86400000 }).map((p) => p.id),
    [],
    "a comparison a day old was fetched again",
  );
  /* And asked again a week later, because a stale price presented as today's
     is the failure this whole module exists to avoid. */
  assert.deepStrictEqual(
    productsNeedingComparables(db, { limit: 10, market: "us", now: now + 8 * 86400000 }).map((p) => p.id),
    [1, 2],
  );

  /* The allowance runs out: stop, and say so. The catalogue refresh spends
     from the same allowance and matters more than a comparison. */
  let asked = 0;
  const exhausted = {
    async searchByGtin() {
      asked += 1;
      const error = new Error("The request limit has been reached for the resource");
      error.status = 429;
      throw error;
    },
  };
  const stopped = await refreshComparables(db, {
    client: exhausted,
    market: { code: "us", countryCodes: ["US"] },
    limit: 10,
    now: now + 8 * 86400000,
  });
  assert.strictEqual(asked, 1, "the sweep kept calling after eBay said the allowance was gone");
  assert.match(stopped.stopped || "", /allowance/i);
  /* The match it already had is still there: a quiet day does not erase it. */
  assert.strictEqual(comparableFor(db, 1).price, 79.5);

  /* A listing that fails for its own reason is recorded as asked rather than
     blocking every later batch behind it. */
  const broken = { async searchByGtin() { throw new Error("eBay Browse API failed: 500"); } };
  const afterFailure = await refreshComparables(db, {
    client: broken,
    market: { code: "us", countryCodes: ["US"] },
    limit: 10,
    now: now + 9 * 86400000,
  });
  assert.strictEqual(afterFailure.failed, 2);
  assert.strictEqual(comparableFor(db, 1), null, "a failed lookup must clear the price it can no longer vouch for");

  /* Nothing is invented when there is no client at all. */
  saveComparable(db, { productId: 2, barcode: "4006381333931", match: null, now });
  assert.strictEqual(comparableFor(db, 2), null);

  console.log("comparables: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
