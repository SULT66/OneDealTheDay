/*
 * The pick of the day has to be a price we confirmed today.
 *
 * The page that shows it carries a "Checked today" badge and refuses to print
 * that over yesterday's price — which is right. The selection did not apply
 * the same rule, so a listing that scored well and was not re-checked in that
 * run could be saved as number one. The page then had a drop it would not
 * show, gave up on the first pick without looking at the nine behind it, and
 * answered the whole day with "no freshly checked drop today" while the
 * catalogue was full of prices confirmed that morning.
 *
 * Measured on production on 2026-10-07: ten picks saved, number one last
 * checked two days earlier, numbers two and three confirmed the evening
 * before, and an empty page.
 *
 * Both ends now agree on what "today" means. See src/catalogRecalculation.js
 * and getTodaysDrop in lib/catalog.ts.
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-drop-freshness-"));
process.env.SUPPORTED_MARKETS = "us";

const { isCheckedToday } = require("../src/marketCalendar");
const { recalculateCatalog } = require("../src/catalogRecalculation");
const db = require("../src/db");

/* ------------------------------------------------- what "today" means here */

/* The market's own calendar, not the server's. A check at 23:00 in New York is
   already tomorrow in UTC, and a drop for New York must not be decided by a
   clock in another hemisphere. */
const newYorkEvening = new Date("2026-10-06T23:30:00-04:00");
const nextMorningInNewYork = new Date("2026-10-07T08:00:00-04:00");
assert.strictEqual(isCheckedToday(newYorkEvening.toISOString(), "us", newYorkEvening), true);
assert.strictEqual(
  isCheckedToday(newYorkEvening.toISOString(), "us", nextMorningInNewYork),
  false,
  "yesterday evening is not today, however recent it feels",
);
assert.strictEqual(isCheckedToday("", "us"), false);
assert.strictEqual(isCheckedToday("not a date", "us"), false);

/* ------------------------------------------------------------ the selection */

const hoursAgo = hours => new Date(Date.now() - hours * 3600000).toISOString();
/* Far enough back to be yesterday in every timezone this site serves. */
const STALE = hoursAgo(50);
const FRESH = new Date().toISOString();

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
    @price,@original,'USD',4.7,310,'published',@gtin,
    @checked_at,@now,@now,@now
  )
`);

const now = new Date().toISOString();
const add = (title, gtin, price, original, checkedAt) => insert.run({
  external_id: `offer-${gtin}`,
  product_key: `gtin:${gtin}`,
  gtin,
  title,
  price,
  original,
  checked_at: checkedAt,
  now,
});

/* The best offer in the catalogue by every measure except one: nobody has
   confirmed its price since the day before yesterday. */
add("Ergonomic office chair, deepest discount", "00000000000011", 99, 299, STALE);
add("Ergonomic office chair, mesh back", "00000000000022", 129, 259, FRESH);
add("Ergonomic office chair, leather", "00000000000033", 159, 259, FRESH);

recalculateCatalog(db, ["us"], { force: true, selectionMarkets: ["us"] });

const picks = db.prepare(`
  SELECT d.rank, p.title, p.checked_at
  FROM daily_drops d JOIN products p ON p.id = d.product_id
  WHERE d.market='us' ORDER BY d.rank
`).all();

assert.ok(picks.length > 0, "nothing was selected at all — the fixture is no longer eligible");
for (const pick of picks) {
  assert.ok(
    isCheckedToday(pick.checked_at, "us"),
    `pick ${pick.rank} ("${pick.title}") was saved with a price last confirmed ${pick.checked_at}`,
  );
}
assert.ok(
  !picks.some(pick => pick.title.includes("deepest discount")),
  "the best-scoring listing was chosen as the day's pick without a price confirmed today",
);

/* And when nothing was confirmed today there is no honest pick. An empty slot
   is what this site says it does in that case rather than filling it with a
   price it cannot stand behind. */
db.prepare("UPDATE products SET checked_at=?").run(STALE);
recalculateCatalog(db, ["us"], { force: true, selectionMarkets: ["us"] });
assert.strictEqual(
  db.prepare("SELECT COUNT(*) AS n FROM daily_drops WHERE market='us'").get().n,
  0,
  "a day with no confirmed prices still published a pick",
);

/* ------------------------------------------------------------- and the page */

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

const recalculation = read("src/catalogRecalculation.js");
assert.ok(
  recalculation.includes("isCheckedToday(product.checked_at, code)"),
  "the selection no longer checks that the price was confirmed today",
);

const catalog = read("lib/catalog.ts");
assert.ok(
  /getTodaysDrop[\s\S]*?deals\.find\(deal => deal\.priceIsCurrent && isCheckedToday/.test(catalog),
  "the page is back to giving up on the first pick instead of looking past it",
);
assert.ok(
  !/getTodaysDrop[\s\S]{0,400}fetchMarketCatalog\(marketCode, 1,/.test(catalog),
  "the page asks the backend for one pick, so it has nothing to look past",
);

db.close?.();
try {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
} catch {
  /* Windows holds the file open for a moment after close; the temporary
     directory is the operating system's to clean up. */
}
console.log("daily drop freshness: ok");
