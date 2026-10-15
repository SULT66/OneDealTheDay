/*
 * The page a listing becomes after it leaves the catalogue.
 *
 * Built on the real schema from src/db.js, the way test-page-views.js is.
 *
 * Measured against production on 2026-10-15: a listing that has been archived
 * serves 404. That is correct for a shop and wrong here — a pin lives six
 * months to a year and a guide links out for longer, so the end of one of
 * those links is reached long after the offer is over, and a 404 throws away
 * a visitor who came looking for exactly the kind of thing we still have.
 *
 * The trap this file exists for is in the query: sourceSql() rejects anything
 * whose availability reads "unavailable", and archiving a listing is what sets
 * it (src/refresh.js). Written the obvious way, the lookup filters out every
 * row it exists to find, and the page 404s exactly as before — silently, with
 * all the new code apparently working.
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-ended-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { alternativesFor, endedProduct } = require("../src/endedOffer");

const isPublicSource = (source) => ["ebay", "newegg"].includes(String(source || "").toLowerCase());

/* The source filter as the live site builds it, availability clause included —
   this is the clause the lookup must not be written through. */
const SOURCE_SQL = `(LOWER(COALESCE(source,'')) IN ('ebay','newegg')
  AND LOWER(COALESCE(availability,'')) NOT LIKE '%unavailable%'
  AND LOWER(COALESCE(availability,'')) NOT LIKE '%out of stock%')`;

const add = ({ id, status, market = "us", source = "ebay", category = "Tools", availability = "In stock", score = 80 }) =>
  db.prepare(`
    INSERT INTO products(id,market,title,current_price,currency,source,status,normalized_category,
      availability,score,ranking_score,image_url,affiliate_url,first_seen_at,updated_at,checked_at)
    VALUES(?,?,?,?,'USD',?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, market, `Listing ${id}`, 19.99, source, status, category, availability, score, score,
    `https://example.test/${id}.jpg`, `https://example.test/go/${id}`,
    "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z",
  );

/*
 * An archived listing looks exactly like this: the refresh sets the status and
 * the availability together.
 */
add({ id: 1, status: "archived", availability: "Unavailable" });
add({ id: 2, status: "published" });
add({ id: 3, status: "published", category: "Tools", score: 90 });
add({ id: 4, status: "published", category: "Electronics", score: 95 });
add({ id: 5, status: "archived", availability: "Unavailable", market: "uk" });
add({ id: 6, status: "archived", availability: "Unavailable", source: "demo" });

/* ------------------------------------------------------------ the lookup */

const gone = endedProduct(db, { id: 1, market: "us", isPublicSource });
assert.ok(
  gone,
  "an archived listing was not found — most likely the query went through sourceSql(), "
    + "whose availability clause rejects the very rows archiving creates",
);
assert.strictEqual(gone.id, 1);
assert.strictEqual(gone.status, "archived");

assert.strictEqual(
  endedProduct(db, { id: 2, market: "us", isPublicSource }),
  null,
  "a live listing was served as ended, so its real page would never render",
);
assert.strictEqual(
  endedProduct(db, { id: 5, market: "us", isPublicSource }),
  null,
  "a listing archived in another market answered for this one",
);
assert.strictEqual(
  endedProduct(db, { id: 6, market: "us", isPublicSource }),
  null,
  "a listing from a source we do not publish was exposed through the ended page",
);
assert.strictEqual(endedProduct(db, { id: 999, market: "us", isPublicSource }), null);
assert.strictEqual(endedProduct(db, { id: "../../etc", market: "us", isPublicSource }), null);
assert.strictEqual(endedProduct(db, { id: 1, market: "", isPublicSource }), null);

/* ------------------------------------------------------ what to show next */

const sameCategory = alternativesFor(db, { market: "us", category: "Tools", sourceSql: SOURCE_SQL });
assert.deepStrictEqual(
  sameCategory.map((row) => row.id),
  [3, 2],
  "the replacements were not the live listings of the same kind, best first",
);
assert.ok(
  !sameCategory.some((row) => row.status !== "published"),
  "an archived listing was offered as a replacement for an archived listing",
);
assert.ok(
  !sameCategory.some((row) => row.id === 1),
  "the expired listing was offered as its own replacement",
);

/* No category on the archived row: the strongest current listings stand in,
   because a short list of good things beats an empty page. */
const anything = alternativesFor(db, { market: "us", category: "", sourceSql: SOURCE_SQL });
assert.strictEqual(anything[0].id, 4, "with no category to match, the best listing did not come first");
assert.ok(anything.length >= 3, "an empty category produced an empty page");

assert.deepStrictEqual(
  alternativesFor(db, { market: "uk", category: "Tools", sourceSql: SOURCE_SQL }),
  [],
  "listings from another market were offered as replacements",
);

console.log("Expired offer page checks passed.");
