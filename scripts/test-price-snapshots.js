const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");
const { createPriceSnapshotWriter, moneyToMinor, normalizeCurrency } = require("../src/priceSnapshots");

class TestDatabase {
  constructor(filename = ":memory:") {
    this.database = new DatabaseSync(filename);
  }

  pragma(value) {
    return this.database.exec(`PRAGMA ${value}`);
  }

  exec(sql) {
    return this.database.exec(sql);
  }

  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all:(...params) => statement.all(...params),
      get:(...params) => statement.get(...params),
      run:(...params) => statement.run(...params)
    };
  }

  transaction(callback) {
    return (...args) => {
      this.exec("BEGIN");
      try {
        const result = callback(...args);
        this.exec("COMMIT");
        return result;
      } catch (error) {
        this.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const db = new TestDatabase();
db.exec(`
  CREATE TABLE price_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    offer_id INTEGER,
    ingestion_run_id INTEGER,
    price REAL NOT NULL,
    original_price REAL,
    price_minor INTEGER,
    reference_price_minor INTEGER,
    currency TEXT NOT NULL,
    source TEXT,
    availability TEXT,
    shipping_minor INTEGER,
    source_updated_at TEXT,
    our_observed_at TEXT,
    observed_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX idx_price_history_offer_run
    ON price_history(offer_id,ingestion_run_id) WHERE ingestion_run_id IS NOT NULL;
  CREATE TABLE price_snapshot_quarantine(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_run_id INTEGER NOT NULL,
    external_id TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    reason_code TEXT NOT NULL,
    reason_detail TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    quarantined_at TEXT NOT NULL,
    UNIQUE(ingestion_run_id,external_id,reason_code)
  );
`);

assert.strictEqual(normalizeCurrency("usd"), "USD");
assert.strictEqual(normalizeCurrency("US-DOLLAR"), null);
assert.strictEqual(moneyToMinor(24.99, "USD"), 2499);
assert.strictEqual(moneyToMinor(1250, "JPY"), 1250);
assert.strictEqual(moneyToMinor(0, "USD"), null);
assert.strictEqual(moneyToMinor(0, "USD", {allowZero:true}), 0);

const writer = createPriceSnapshotWriter(db);
const observedAt = "2026-08-14T14:30:00.000Z";
const valid = {
  external_id:"us:feed-target:sku-1",
  source:"feed-target",
  market:"us",
  title:"Test product",
  current_price:24.99,
  original_price:39.99,
  shipping_cost:0,
  currency:"USD",
  availability:"Available",
  source_updated_at:"2026-08-14T14:00:00Z",
  affiliate_url:"https://target.example/track/sku-1"
};

assert.deepStrictEqual(writer.record({offerId:7, ingestionRunId:101, product:valid, observedAt}), {status:"inserted"});
let snapshot = db.prepare("SELECT * FROM price_history WHERE offer_id=7 AND ingestion_run_id=101").get();
assert.strictEqual(snapshot.price_minor, 2499, "Observed price was not stored in minor units");
assert.strictEqual(snapshot.reference_price_minor, 3999, "Retailer reference price was not kept separate");
assert.strictEqual(snapshot.shipping_minor, 0, "Free shipping was not stored as zero");
assert.strictEqual(snapshot.our_observed_at, observedAt, "Mandatory observation time was not stored");
assert.strictEqual(snapshot.source_updated_at, "2026-08-14T14:00:00.000Z");
assert.strictEqual(snapshot.price, 24.99, "Legacy price compatibility column was not populated");

assert.deepStrictEqual(writer.record({offerId:7, ingestionRunId:101, product:valid, observedAt}), {status:"duplicate"});
assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history").get().n, 1, "Same offer/run created a duplicate snapshot");

assert.deepStrictEqual(writer.record({offerId:7, ingestionRunId:102, product:valid, observedAt}), {status:"inserted"});
assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history").get().n, 2, "A new run did not append an unchanged price");

const partial = {
  ...valid,
  external_id:"us:feed-target:sku-2",
  original_price:null,
  shipping_cost:null,
  source_updated_at:null,
  source_availability:null
};
assert.deepStrictEqual(writer.record({offerId:8, ingestionRunId:102, product:partial, observedAt}), {status:"inserted"});
snapshot = db.prepare("SELECT * FROM price_history WHERE offer_id=8").get();
assert.strictEqual(snapshot.reference_price_minor, null);
assert.strictEqual(snapshot.shipping_minor, null);
assert.strictEqual(snapshot.availability, null);
assert.strictEqual(snapshot.source_updated_at, null);

const invalidCases = [
  [9, {...valid, external_id:"bad-price", current_price:0}, "invalid_price"],
  [10, {...valid, external_id:"bad-currency", currency:"US-DOLLAR"}, "invalid_currency"],
  [11, {...valid, external_id:"bad-url", affiliate_url:"javascript:alert(1)"}, "invalid_url"]
];
for (const [offerId, product, reason] of invalidCases) {
  assert.deepStrictEqual(
    writer.record({offerId, ingestionRunId:103, product, observedAt}),
    {status:"quarantined", reason}
  );
}
assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_snapshot_quarantine").get().n, 3);
assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history WHERE ingestion_run_id=103").get().n, 0);
const quarantinePayload = JSON.parse(db.prepare("SELECT payload_json FROM price_snapshot_quarantine WHERE external_id='bad-url'").get().payload_json);
assert.strictEqual(quarantinePayload.affiliate_host, null);
assert(!JSON.stringify(quarantinePayload).includes("javascript:"), "Unsafe URL leaked into quarantine payload");

const beforeRollback = db.prepare("SELECT COUNT(*) n FROM price_history").get().n;
assert.throws(() => db.transaction(() => {
  writer.record({offerId:12, ingestionRunId:104, product:{...valid, external_id:"rollback"}, observedAt});
  throw new Error("simulated catalog failure");
})(), /simulated catalog failure/);
assert.strictEqual(
  db.prepare("SELECT COUNT(*) n FROM price_history").get().n,
  beforeRollback,
  "A failed transaction changed committed snapshot history"
);

const migrationDir = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-snapshot-migration-"));
const legacy = new DatabaseSync(path.join(migrationDir, "site.db"));
legacy.exec(`
  CREATE TABLE price_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    price REAL NOT NULL,
    original_price REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,
    observed_at TEXT NOT NULL
  );
  INSERT INTO price_history(product_id,price,original_price,currency,source,observed_at)
  VALUES(77,19.95,29.95,'USD','legacy','2026-08-01T10:00:00Z');
`);
legacy.close();

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};
process.env.DATA_DIR = migrationDir;
const migratedDb = require("../src/db");
const migrated = migratedDb.prepare("SELECT * FROM price_history WHERE product_id=77").get();
assert.strictEqual(migrated.offer_id, 77, "Legacy history did not receive offer_id");
assert.strictEqual(migrated.price_minor, 1995, "Legacy price was not migrated to minor units");
assert.strictEqual(migrated.reference_price_minor, 2995, "Legacy reference price was not migrated separately");
assert.strictEqual(migrated.our_observed_at, "2026-08-01T10:00:00Z", "Legacy observation time was not preserved");
assert.strictEqual(migrated.ingestion_run_id, null, "A synthetic ingestion run was invented for legacy history");

console.log("Price snapshot contract validation passed.");
