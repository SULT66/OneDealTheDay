/*
 * Two rules about what the catalogue publishes (src/trackedPrice.js and the
 * per-shop cap in src/publicCatalog.js).
 *
 * The first is a number we can claim as ours: how far a price sits below the
 * highest we ourselves recorded. Measured on the live catalogue, most prices
 * have never moved at all — so the badge has to be earned, and a catalogue
 * covered in "1% off" would mean nothing.
 *
 * The second is how much of a category one supplier may fill. Newegg sends
 * 1,500 of the 1,532 listings in Electronics; without a cap the category page
 * and the sitemap are one feed wearing our header.
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
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-tracked-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { MIN_DROP_PERCENT, dailyCloses, trackedDrop, updateTrackedPrices } = require("../src/trackedPrice");
const { capPerSourceAndCategory } = require("../src/publicCatalog");

const now = Date.parse("2026-09-25T12:00:00Z");
const day = (offset, price) => ({
  price,
  observed_at: new Date(now - offset * 86400000).toISOString(),
});

/* ------------------------------------------------- one price per day */

/* Prices are checked four to six times a day. Counting observations would
   weight a busy Tuesday six times a quiet Friday. */
const closes = dailyCloses([
  { price: 120, observed_at: "2026-09-20T02:00:00Z" },
  { price: 110, observed_at: "2026-09-20T18:00:00Z" },
  { price: 100, observed_at: "2026-09-21T09:00:00Z" },
]);
assert.deepStrictEqual(closes, [["2026-09-20", 110], ["2026-09-21", 100]]);
assert.deepStrictEqual(dailyCloses([{ price: 0, observed_at: "2026-09-21T09:00:00Z" }]), [], "a zero is not a price");
assert.deepStrictEqual(dailyCloses([{ price: 10, observed_at: "nonsense" }]), []);

/* --------------------------------------------------------- the drop */

/* Fell from 200 to 150: a quarter below our own tracked high. */
assert.strictEqual(trackedDrop([day(9, 200), day(5, 180), day(0, 150)], { now }).dropPercent, 25);

/* Never moved — which is most of the catalogue, and gets no badge. */
assert.strictEqual(trackedDrop([day(9, 99), day(5, 99), day(0, 99)], { now }).dropPercent, 0);

/* Rose. A price above everything we saw is not a drop. */
assert.strictEqual(trackedDrop([day(9, 80), day(5, 90), day(0, 120)], { now }).dropPercent, 0);

/* Two days is a price and its neighbour, not a history. */
assert.strictEqual(trackedDrop([day(1, 200), day(0, 100)], { now }).dropPercent, 0);

/* A move too small to act on says nothing, and a catalogue of "2% off" reads
   as noise. */
assert.strictEqual(trackedDrop([day(9, 102), day(5, 101), day(0, 100)], { now }).dropPercent, 0);
assert.strictEqual(MIN_DROP_PERCENT, 5);

/* The low is ours too, and it is the lowest we saw, not the current price. */
const measured = trackedDrop([day(9, 200), day(6, 140), day(0, 150)], { now });
assert.strictEqual(measured.low, 140);
assert.strictEqual(measured.dropPercent, 25);

/* Older than the window is not held against today. */
assert.strictEqual(trackedDrop([day(120, 400), day(9, 100), day(5, 100), day(0, 100)], { now }).dropPercent, 0);

/* ------------------------------------------------ written onto products */

const insert = db.prepare(`
  INSERT INTO products(id,market,source,external_id,title,current_price,currency,status,normalized_category,affiliate_url,image_url,updated_at,checked_at,first_seen_at,last_seen_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);
const addProduct = (id, source, category = "Electronics", status = "published") => insert.run(
  id, "us", source, `${source}:${id}`, `Product ${id}`, 100, "USD", status, category,
  "https://example.com/go", "https://example.com/i.jpg",
  "2026-09-01T00:00:00Z", "2026-09-25T00:00:00Z", "2026-09-01T00:00:00Z", "2026-09-25T00:00:00Z",
);
const observe = db.prepare(`
  INSERT INTO price_history(product_id,offer_id,price,price_minor,currency,observed_at,our_observed_at)
  VALUES(?,?,?,?,?,?,?)
`);
const record = (productId, offset, price) => {
  const at = new Date(now - offset * 86400000).toISOString();
  observe.run(productId, productId, price, Math.round(price * 100), "USD", at, at);
};

addProduct(1, "newegg");
addProduct(2, "newegg");
addProduct(3, "feed-giftlab", "Gifts");
[[1, 200], [1, 180], [1, 150]].forEach(([id, price], index) => record(id, 9 - index * 4, price));
[[2, 99], [2, 99], [2, 99]].forEach(([id, price], index) => record(id, 9 - index * 4, price));

const summary = updateTrackedPrices(db, { now });
assert.strictEqual(summary.updated, 2, "only products with observations were touched");
assert.strictEqual(summary.withDrop, 1);

const readBack = (id) => db.prepare("SELECT tracked_drop_percent, tracked_low FROM products WHERE id=?").get(id);
assert.strictEqual(readBack(1).tracked_drop_percent, 25);
assert.strictEqual(readBack(1).tracked_low, 150);
assert.strictEqual(readBack(2).tracked_drop_percent, 0, "a price that never moved was given a badge");
assert.strictEqual(readBack(3).tracked_drop_percent, 0, "a product with no history was given a badge");

/* A history that ages out takes the badge with it rather than leaving
   yesterday's claim on the page. */
const later = updateTrackedPrices(db, { now: now + 120 * 86400000 });
assert.strictEqual(later.withDrop, 0);
assert.strictEqual(readBack(1).tracked_drop_percent, 0);

/* ------------------------------------------------- one shop per shelf */

const shelf = [
  ...Array.from({ length: 650 }, (_, index) => ({ id: index, normalized_category: "Electronics", source: "newegg" })),
  ...Array.from({ length: 50 }, (_, index) => ({ id: 1000 + index, normalized_category: "Electronics", source: "ebay" })),
  ...Array.from({ length: 400 }, (_, index) => ({ id: 2000 + index, normalized_category: "Gifts", source: "feed-giftlab" })),
];
const capped = capPerSourceAndCategory(shelf, { cap: 300 });
assert.strictEqual(capped.filter((p) => p.source === "newegg").length, 300, "one supplier still fills the shelf");
assert.strictEqual(capped.filter((p) => p.source === "ebay").length, 50, "a small shop was capped as if it were large");
assert.strictEqual(capped.filter((p) => p.source === "feed-giftlab").length, 300);
/* The cap is per category, so a shop is not punished in one aisle for filling
   another. */
const acrossCategories = capPerSourceAndCategory([
  ...Array.from({ length: 5 }, (_, index) => ({ id: index, normalized_category: "Electronics", source: "newegg" })),
  ...Array.from({ length: 5 }, (_, index) => ({ id: 100 + index, normalized_category: "Office", source: "newegg" })),
], { cap: 5 });
assert.strictEqual(acrossCategories.length, 10);
/* Order is the ranking's, so what survives is the best of that shop. */
assert.deepStrictEqual(capped.slice(0, 3).map((p) => p.id), [0, 1, 2]);
/* And a cap of zero means no cap, not an empty site. */
assert.strictEqual(capPerSourceAndCategory(shelf, { cap: 0 }).length, shelf.length);

console.log("tracked price and per-shop cap: ok");
