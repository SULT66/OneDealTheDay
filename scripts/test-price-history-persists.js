/*
 * What our own price observations say, kept rather than recomputed.
 *
 * recalculateCatalog worked out four numbers from price_history on every run —
 * the 30- and 90-day averages and lows — spread them onto an in-memory copy of
 * the row, scored the row with them, and wrote none of them down. Three
 * separate readers ask for them afterwards: evidenceConfidence counts a price
 * we can compare against as 25 of its 100 points, commerceQuality asks the same
 * question, and priceScore measures today's price against the 30-day average.
 * All three read zero.
 *
 * Measured on production on 2026-10-13: average_30_day_price was 0 on all 2,426
 * listings, while 1,766 of them had a tracked low from the same history. So a
 * listing was scored one way during ingest and another way on its own page —
 * the fault src/ranker.js already documents for source_rank, in its second
 * instance.
 *
 * This file pins the round trip: history in, columns out, and the readers
 * seeing what the writer saw.
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
  close() { this.database.close(); }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-price-history-"));
process.env.SUPPORTED_MARKETS = "us";

const { recalculateCatalog } = require("../src/catalogRecalculation");
const { evidenceConfidence } = require("../src/ranker");
const db = require("../src/db");

const now = new Date().toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

const insert = db.prepare(`
  INSERT INTO products(
    external_id,provider_external_id,product_key,market,source,title,description,category,
    normalized_category,image_url,affiliate_url,retailer_name,seller_name,seller_rating,
    seller_feedback_count,availability,shipping_summary,shipping_cost,return_summary,
    current_price,original_price,currency,rating,review_count,status,gtin,
    checked_at,updated_at,first_seen_at,last_seen_at
  ) VALUES(
    @external_id,@external_id,@product_key,'us','ebay',@title,'A useful catalog product','office chair',
    'Office','https://images.test/p.jpg','https://click.test/p','eBay','Example seller',4.9,
    1200,'In stock','Free shipping',0,'30-day returns',
    @price,NULL,'USD',@rating,@reviews,'published',@gtin,
    @now,@now,@now,@now
  )
`);

/* No original_price on purpose: the seller offers nothing to compare against,
   so our own history is the only price evidence there can be. That is exactly
   the case the missing columns were deciding wrongly. */
const watched = insert.run({
  external_id: "offer-watched", product_key: "gtin:00000000000011", gtin: "00000000000011",
  title: "Ergonomic office chair, watched for a month", price: 149, rating: 4.7, reviews: 310, now,
}).lastInsertRowid;

const unwatched = insert.run({
  external_id: "offer-unwatched", product_key: "gtin:00000000000022", gtin: "00000000000022",
  title: "Ergonomic office chair, first seen today", price: 149, rating: 4.7, reviews: 310, now,
}).lastInsertRowid;

/* A month of our own observations, one a day, falling from 199 to 149. */
const observe = db.prepare("INSERT INTO price_history(product_id,price,currency,observed_at) VALUES(?,?,?,?)");
for (let day = 29; day >= 0; day -= 1) {
  observe.run(watched, 199 - (29 - day) * (50 / 29), "USD", daysAgo(day));
}

recalculateCatalog(db, ["us"], { force: true, selectionMarkets: ["us"] });

const read = (id) => db.prepare(`
  SELECT average_30_day_price, lowest_30_day_price, average_90_day_price, lowest_90_day_price,
         price_history_observation_count, price_history_distinct_days, price_history_coverage_days,
         evidence_confidence
  FROM products WHERE id=?
`).get(id);

/* --- The row we watched carries what we saw. --- */
const kept = read(watched);
assert.ok(
  kept.average_30_day_price > 0,
  "the 30-day average is still computed, used to score the row, and thrown away",
);
assert.ok(kept.lowest_30_day_price > 0 && kept.lowest_30_day_price <= kept.average_30_day_price);
assert.ok(kept.average_90_day_price > 0, "the 90-day average did not survive either");
assert.strictEqual(kept.price_history_observation_count, 30, "the observation count is not kept");
assert.strictEqual(kept.price_history_distinct_days, 30);
assert.ok(kept.price_history_coverage_days >= 29);

/* --- And a row we have not watched says so, rather than saying nothing. --- */
const blank = read(unwatched);
assert.strictEqual(blank.average_30_day_price, 0, "a listing with no history should read zero, not null");
assert.strictEqual(blank.price_history_observation_count, 0);

/*
 * --- The readers see what the writer saw. ---
 *
 * This is the whole point. evidenceConfidence awards 25 points for a price
 * there is something to compare against, and with the columns gone it awarded
 * them during the run and withheld them from every later caller.
 */
const storedRow = db.prepare("SELECT * FROM products WHERE id=?").get(watched);
const barerow = db.prepare("SELECT * FROM products WHERE id=?").get(unwatched);
assert.ok(
  evidenceConfidence(storedRow) > evidenceConfidence(barerow),
  "a month of our own observations counts for nothing once the row is read back",
);
assert.strictEqual(
  evidenceConfidence(storedRow) - evidenceConfidence(barerow),
  25,
  "price evidence is worth 25 points; the stored row is not collecting them",
);
assert.strictEqual(
  evidenceConfidence(storedRow),
  storedRow.evidence_confidence,
  "the confidence stored during the run disagrees with the confidence computed from the stored row — " +
  "which is the entire bug: a listing scored one way at ingest and another way on its page",
);

console.log("price history persists: ok");
