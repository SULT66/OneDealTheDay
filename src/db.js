const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { repairIndexesIfNeeded } = require("./sqliteRecovery");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const dir = process.env.DATA_DIR || (isAzure ? "/home/data/onedealtheday" : path.join(__dirname, "..", "data"));

fs.mkdirSync(dir, { recursive: true });

const dbPath = path.join(dir, "site.db");
const db = new Database(dbPath);

/**
 * Journal mode is the one setting that decides whether this database survives.
 *
 * WAL is the right default on a local disk and the wrong one here. On Azure
 * App Service the data directory lives under /home, which is an SMB network
 * share, and SQLite documents plainly that WAL does not work over a network
 * filesystem: it needs shared memory and byte-range locks that SMB does not
 * provide. The failure is not a clean error but slow corruption — an integrity
 * check on 2026-08-20 found 96 damaged index entries while every table's rows
 * were intact, which is the signature of small scattered index writes being
 * lost while large sequential ones land.
 *
 * So: rollback journal on Azure, WAL everywhere else, and an override for
 * whoever eventually moves this onto real storage.
 */
const JOURNAL_MODES = new Set(["DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF"]);
const requestedJournalMode = String(process.env.SQLITE_JOURNAL_MODE || "").trim().toUpperCase();
const journalMode = JOURNAL_MODES.has(requestedJournalMode)
  ? requestedJournalMode
  : (isAzure ? "DELETE" : "WAL");
db.pragma(`journal_mode = ${journalMode}`);

/* Wait for a contended lock instead of throwing at once: a write over network
   storage takes far longer than the same write on a local disk. */
db.pragma("busy_timeout = 10000");

/* On storage this unreliable, durability is worth the throughput. */
if (isAzure) db.pragma("synchronous = FULL");

console.log(
  `[db] ${dbPath} journal_mode=${db.pragma("journal_mode", { simple: true })}` +
  ` synchronous=${db.pragma("synchronous", { simple: true })}`
);

// Azure's /home directory is a network share. Older WAL-based deployments
// damaged index pages while leaving the underlying table rows intact. Preserve
// the original file, rebuild only the indexes, and verify integrity before any
// startup migration writes to them.
repairIndexesIfNeeded(db, dbPath, { enabled: isAzure });

db.exec(`
  CREATE TABLE IF NOT EXISTS products(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    provider_external_id TEXT,
    market TEXT NOT NULL DEFAULT 'us',
    product_key TEXT,
    upc TEXT,
    gtin TEXT,
    model_number TEXT,
    brand TEXT,
    brand_slug TEXT,
    manufacturer TEXT,
    mpn TEXT,
    ean TEXT,
    title TEXT,
    category TEXT,
    normalized_category TEXT,
    taxonomy_version TEXT,
    description TEXT,
    image_url TEXT,
    affiliate_url TEXT,
    retailer_shop_url TEXT,
    retailer_name TEXT,
    seller_name TEXT,
    seller_rating REAL,
    seller_feedback_count INTEGER,
    shipping_summary TEXT,
    return_summary TEXT,
    shipping_cost REAL,
    landed_cost REAL,
    availability TEXT,
    checked_at TEXT,
    rating REAL,
    review_count INTEGER,
    current_price REAL,
    original_price REAL,
    currency TEXT,
    badge TEXT,
    score REAL,
    relevance_score REAL,
    commerce_quality REAL,
    ranking_score REAL,
    evidence_confidence REAL,
    score_breakdown TEXT,
    selection_reason TEXT,
    source TEXT,
    status TEXT,
    updated_at TEXT,
    first_seen_at TEXT,
    last_seen_at TEXT
  );
  CREATE TABLE IF NOT EXISTS refresh_runs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT,
    market TEXT NOT NULL DEFAULT 'us',
    started_at TEXT,
    finished_at TEXT,
    found_count INTEGER,
    published_count INTEGER,
    status TEXT,
    message TEXT
  );
  CREATE TABLE IF NOT EXISTS source_refresh_runs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refresh_run_id INTEGER NOT NULL,
    provider_id TEXT NOT NULL,
    source TEXT NOT NULL,
    market TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    found_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(refresh_run_id) REFERENCES refresh_runs(id)
  );
  CREATE TABLE IF NOT EXISTS automation_alerts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    provider_id TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'warning',
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS distribution_queue(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market TEXT NOT NULL,
    drop_date TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready',
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    delivered_at TEXT,
    UNIQUE(market,drop_date,channel)
  );
  CREATE TABLE IF NOT EXISTS clicks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT,
    session_id TEXT NOT NULL DEFAULT '',
    product_id INTEGER,
    market TEXT NOT NULL DEFAULT 'us',
    retailer_name TEXT NOT NULL DEFAULT '',
    source_page TEXT NOT NULL DEFAULT 'unknown',
    placement TEXT NOT NULL DEFAULT 'unknown',
    action_type TEXT NOT NULL DEFAULT 'view_deal',
    destination_type TEXT NOT NULL DEFAULT 'retailer',
    clicked_at TEXT,
    referrer TEXT,
    user_agent TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    market TEXT NOT NULL DEFAULT 'us',
    source_page TEXT NOT NULL DEFAULT 'unknown',
    placement TEXT NOT NULL DEFAULT 'unknown',
    product_id INTEGER,
    position INTEGER,
    query_text TEXT NOT NULL DEFAULT '',
    result_count INTEGER,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL,
    referrer TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS price_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    offer_id INTEGER,
    ingestion_run_id INTEGER,
    price REAL NOT NULL,
    original_price REAL,
    price_minor INTEGER,
    reference_price_minor INTEGER,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,
    availability TEXT,
    shipping_minor INTEGER,
    source_updated_at TEXT,
    our_observed_at TEXT,
    observed_at TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id),
    FOREIGN KEY(offer_id) REFERENCES products(id),
    FOREIGN KEY(ingestion_run_id) REFERENCES refresh_runs(id)
  );
  CREATE TABLE IF NOT EXISTS price_snapshot_quarantine(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingestion_run_id INTEGER NOT NULL,
    external_id TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    market TEXT NOT NULL DEFAULT '',
    reason_code TEXT NOT NULL,
    reason_detail TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    quarantined_at TEXT NOT NULL,
    UNIQUE(ingestion_run_id,external_id,reason_code),
    FOREIGN KEY(ingestion_run_id) REFERENCES refresh_runs(id)
  );
  CREATE TABLE IF NOT EXISTS subscribers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    categories TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'homepage',
    market TEXT NOT NULL DEFAULT 'us',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    membership TEXT NOT NULL DEFAULT 'free',
    market TEXT NOT NULL DEFAULT 'us',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_subscription_status TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_sessions(
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens(
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS price_alerts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_url TEXT NOT NULL,
    target_price REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS daily_drops(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market TEXT NOT NULL,
    drop_date TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    score REAL NOT NULL,
    score_model TEXT,
    current_price REAL,
    original_price REAL,
    currency TEXT,
    selection_reason TEXT,
    availability_status TEXT NOT NULL DEFAULT 'Available',
    selected_at TEXT NOT NULL,
    UNIQUE(market, drop_date, rank),
    UNIQUE(market, drop_date, product_id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS ebay_account_deletion_receipts(
    notification_id TEXT PRIMARY KEY,
    event_date TEXT,
    received_at TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shopping_assistant_feedback(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    market TEXT NOT NULL DEFAULT 'us',
    product_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT ''
  );
`);

const userColumns = new Set(db.prepare("PRAGMA table_info(users)").all().map(column => column.name));
for (const column of ["stripe_customer_id", "stripe_subscription_id", "stripe_subscription_status", "market"]) {
  if (!userColumns.has(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
}

const subscriberColumns = new Set(db.prepare("PRAGMA table_info(subscribers)").all().map(column => column.name));
if (!subscriberColumns.has("market")) db.exec("ALTER TABLE subscribers ADD COLUMN market TEXT NOT NULL DEFAULT 'us'");

const refreshRunColumns = new Set(db.prepare("PRAGMA table_info(refresh_runs)").all().map(column => column.name));
if (!refreshRunColumns.has("market")) db.exec("ALTER TABLE refresh_runs ADD COLUMN market TEXT NOT NULL DEFAULT 'us'");

const clickColumns = new Set(db.prepare("PRAGMA table_info(clicks)").all().map(column => column.name));
if (!clickColumns.has("market")) db.exec("ALTER TABLE clicks ADD COLUMN market TEXT NOT NULL DEFAULT 'us'");
for (const [column, definition] of [
  ["event_id", "TEXT"],
  ["session_id", "TEXT NOT NULL DEFAULT ''"],
  ["retailer_name", "TEXT NOT NULL DEFAULT ''"],
  ["source_page", "TEXT NOT NULL DEFAULT 'unknown'"],
  ["placement", "TEXT NOT NULL DEFAULT 'unknown'"],
  ["action_type", "TEXT NOT NULL DEFAULT 'view_deal'"],
  ["destination_type", "TEXT NOT NULL DEFAULT 'retailer'"]
]) {
  if (!clickColumns.has(column)) db.exec(`ALTER TABLE clicks ADD COLUMN ${column} ${definition}`);
}

const dailyDropColumns = new Set(db.prepare("PRAGMA table_info(daily_drops)").all().map(column => column.name));
if (!dailyDropColumns.has("score_model")) db.exec("ALTER TABLE daily_drops ADD COLUMN score_model TEXT");

const priceHistoryColumns = new Set(db.prepare("PRAGMA table_info(price_history)").all().map(column => column.name));
for (const [column, type] of [
  ["offer_id", "INTEGER"],
  ["ingestion_run_id", "INTEGER"],
  ["price_minor", "INTEGER"],
  ["reference_price_minor", "INTEGER"],
  ["availability", "TEXT"],
  ["shipping_minor", "INTEGER"],
  ["source_updated_at", "TEXT"],
  ["our_observed_at", "TEXT"]
]) {
  if (!priceHistoryColumns.has(column)) db.exec(`ALTER TABLE price_history ADD COLUMN ${column} ${type}`);
}

db.exec(`
  UPDATE price_history
  SET offer_id=COALESCE(offer_id,product_id),
      price_minor=COALESCE(price_minor,CAST(ROUND(price * 100) AS INTEGER)),
      reference_price_minor=CASE
        WHEN reference_price_minor IS NOT NULL THEN reference_price_minor
        WHEN original_price IS NOT NULL AND original_price>0 THEN CAST(ROUND(original_price * 100) AS INTEGER)
        ELSE NULL
      END,
      our_observed_at=COALESCE(NULLIF(our_observed_at,''),observed_at);
`);

const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map(column => column.name));
for (const [column, type] of [
  ["seller_rating", "REAL"],
  ["seller_feedback_count", "INTEGER"],
  ["shipping_cost", "REAL"],
  ["landed_cost", "REAL"],
  ["relevance_score", "REAL"],
  ["commerce_quality", "REAL"],
  ["ranking_score", "REAL"],
  ["evidence_confidence", "REAL"]
]) {
  if (!productColumns.has(column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} ${type}`);
}
for (const column of [
  "product_key",
  "upc",
  "gtin",
  "model_number",
  "brand",
  "brand_slug",
  "manufacturer",
  "mpn",
  "ean",
  "retailer_name",
  "retailer_shop_url",
  "seller_name",
  "shipping_summary",
  "return_summary",
  "availability",
  "checked_at"
  ,"provider_external_id"
  ,"market"
  ,"score_breakdown"
  ,"selection_reason"
  ,"first_seen_at"
  ,"last_seen_at"
  ,"normalized_category"
  ,"taxonomy_version"
]) {
  if (!productColumns.has(column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT`);
}

// Older catalogs used the retailer ID globally. Prefix it once so the same
// ASIN/SKU can safely exist in several country catalogs.
db.exec(`
  UPDATE products
  SET provider_external_id=external_id
  WHERE COALESCE(provider_external_id,'')='';
  UPDATE products
  SET market='us'
  WHERE COALESCE(market,'')='';
  UPDATE products
  SET external_id=market || ':' || provider_external_id
  WHERE external_id NOT LIKE market || ':%';
  UPDATE products SET source='amazon' WHERE LOWER(COALESCE(source,''))='rainforest';
  UPDATE products
  SET provider_external_id=LOWER(source) || ':' || provider_external_id,
      external_id=market || ':' || LOWER(source) || ':' || provider_external_id
  WHERE LOWER(COALESCE(source,'')) IN ('amazon','ebay','walmart','bluecart')
    AND provider_external_id NOT LIKE LOWER(source) || ':%'
    AND NOT EXISTS (
      SELECT 1 FROM products other
      WHERE other.id<>products.id
        AND other.external_id=products.market || ':' || LOWER(products.source) || ':' || products.provider_external_id
    );
  UPDATE products
  SET first_seen_at=COALESCE(NULLIF(first_seen_at,''), NULLIF(updated_at,''), datetime('now')),
      last_seen_at=COALESCE(NULLIF(last_seen_at,''), NULLIF(updated_at,''), datetime('now'));
  UPDATE subscribers SET market='us' WHERE COALESCE(market,'')='';
  UPDATE users SET market='us' WHERE COALESCE(market,'')='';
`);

// Expired offers remain recoverable for history, but are not public catalog
// entries. A later verified refresh can publish the same external ID again.
db.exec(`
  DROP TRIGGER IF EXISTS prevent_product_archiving;
  UPDATE products
  SET status='archived'
  WHERE LOWER(COALESCE(availability,'')) LIKE '%unavailable%'
     OR LOWER(COALESCE(availability,'')) LIKE '%out of stock%'
     OR LOWER(COALESCE(availability,'')) LIKE '%sold out%'
     OR LOWER(COALESCE(availability,'')) LIKE '%expired%'
     OR LOWER(COALESCE(availability,'')) LIKE '%discontinued%';
  CREATE INDEX IF NOT EXISTS idx_products_status_score ON products(status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_score ON products(market, status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_rank ON products(market, status, ranking_score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_provider_id ON products(market, provider_external_id);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_product_key ON products(market, status, LOWER(product_key));
  CREATE INDEX IF NOT EXISTS idx_products_market_status_category_rank ON products(market, status, category, ranking_score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_brand_rank ON products(market, status, brand_slug, ranking_score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_category_score ON products(category, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_normalized_category_score ON products(normalized_category, ranking_score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_normalized_category_rank ON products(market, status, normalized_category, ranking_score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_score ON products(brand_slug, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_name ON products(brand);
  CREATE INDEX IF NOT EXISTS idx_price_history_product_date ON price_history(product_id, observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_price_history_offer_date ON price_history(offer_id, our_observed_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_price_history_offer_run ON price_history(offer_id, ingestion_run_id) WHERE ingestion_run_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_snapshot_quarantine_run ON price_snapshot_quarantine(ingestion_run_id, reason_code);
  CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at DESC);
  CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_daily_drops_market_date_rank ON daily_drops(market, drop_date DESC, rank);
  CREATE INDEX IF NOT EXISTS idx_daily_drops_product ON daily_drops(product_id, drop_date DESC);
  CREATE INDEX IF NOT EXISTS idx_source_refresh_provider_market ON source_refresh_runs(provider_id, market, id DESC);
  CREATE INDEX IF NOT EXISTS idx_automation_alerts_open ON automation_alerts(resolved_at, severity, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_distribution_queue_status ON distribution_queue(status, drop_date, market);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clicks_event_id ON clicks(event_id) WHERE event_id IS NOT NULL AND event_id<>'';
  CREATE INDEX IF NOT EXISTS idx_clicks_session_date ON clicks(session_id, clicked_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_type_date ON analytics_events(event_type, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_session_date ON analytics_events(session_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_analytics_events_product_date ON analytics_events(product_id, occurred_at DESC);
  CREATE INDEX IF NOT EXISTS idx_assistant_feedback_created ON shopping_assistant_feedback(created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_feedback_message_type ON shopping_assistant_feedback(message_id, feedback_type);
`);

// Remove retired preview and hand-entered records with their dependent
// snapshots. Live retailer data is kept so a failed refresh can continue to
// serve the last successfully verified catalog.
db.transaction(() => {
  const retiredIds = "SELECT id FROM products WHERE LOWER(COALESCE(source,'')) IN ('demo','amazon-manual')";
  db.prepare(`DELETE FROM daily_drops WHERE product_id IN (${retiredIds})`).run();
  db.prepare(`DELETE FROM price_history WHERE product_id IN (${retiredIds})`).run();
  db.prepare(`DELETE FROM clicks WHERE product_id IN (${retiredIds})`).run();
  db.prepare(`DELETE FROM analytics_events WHERE product_id IN (${retiredIds})`).run();
  db.prepare("DELETE FROM products WHERE LOWER(COALESCE(source,'')) IN ('demo','amazon-manual')").run();
})();

// Seed one observation for existing products so price intelligence works
// immediately after deployment without discarding any catalog data.
db.exec(`
  INSERT INTO price_history(
    product_id,offer_id,price,original_price,price_minor,reference_price_minor,currency,source,our_observed_at,observed_at
  )
  SELECT p.id,p.id,p.current_price,p.original_price,
         CAST(ROUND(p.current_price * 100) AS INTEGER),
         CASE WHEN p.original_price IS NOT NULL AND p.original_price>0 THEN CAST(ROUND(p.original_price * 100) AS INTEGER) ELSE NULL END,
         COALESCE(NULLIF(p.currency,''),'USD'),p.source,
         COALESCE(NULLIF(p.updated_at,''),datetime('now')),
         COALESCE(NULLIF(p.updated_at,''),datetime('now'))
  FROM products p
  WHERE p.current_price IS NOT NULL
    AND p.current_price > 0
    AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.product_id=p.id);
`);

console.log(`Database: ${dbPath}`);
module.exports = db;
