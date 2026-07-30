const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const dir = process.env.DATA_DIR || (isAzure ? "/home/data/onedealtheday" : path.join(__dirname, "..", "data"));

fs.mkdirSync(dir, { recursive: true });

const dbPath = path.join(dir, "site.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
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
    description TEXT,
    image_url TEXT,
    affiliate_url TEXT,
    retailer_name TEXT,
    seller_name TEXT,
    shipping_summary TEXT,
    return_summary TEXT,
    availability TEXT,
    checked_at TEXT,
    rating REAL,
    review_count INTEGER,
    current_price REAL,
    original_price REAL,
    currency TEXT,
    badge TEXT,
    score REAL,
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
  CREATE TABLE IF NOT EXISTS clicks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    market TEXT NOT NULL DEFAULT 'us',
    clicked_at TEXT,
    referrer TEXT,
    user_agent TEXT
  );
  CREATE TABLE IF NOT EXISTS price_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    price REAL NOT NULL,
    original_price REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    source TEXT,
    observed_at TEXT NOT NULL,
    FOREIGN KEY(product_id) REFERENCES products(id)
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

const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map(column => column.name));
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
  UPDATE products
  SET first_seen_at=COALESCE(NULLIF(first_seen_at,''), NULLIF(updated_at,''), datetime('now')),
      last_seen_at=COALESCE(NULLIF(last_seen_at,''), NULLIF(updated_at,''), datetime('now'));
  UPDATE subscribers SET market='us' WHERE COALESCE(market,'')='';
  UPDATE users SET market='us' WHERE COALESCE(market,'')='';
`);

// Products are a permanent catalog. A refresh may update or add products,
// but it must never remove older products from their categories.
db.exec(`
  UPDATE products SET status='published' WHERE status='archived';
  DROP TRIGGER IF EXISTS prevent_product_archiving;
  CREATE TRIGGER prevent_product_archiving
  BEFORE UPDATE OF status ON products
  WHEN NEW.status='archived'
  BEGIN
    SELECT RAISE(IGNORE);
  END;
  CREATE INDEX IF NOT EXISTS idx_products_status_score ON products(status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_status_score ON products(market, status, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_market_provider_id ON products(market, provider_external_id);
  CREATE INDEX IF NOT EXISTS idx_products_category_score ON products(category, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_score ON products(brand_slug, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_name ON products(brand);
  CREATE INDEX IF NOT EXISTS idx_price_history_product_date ON price_history(product_id, observed_at DESC);
  CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, expires_at DESC);
  CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_daily_drops_market_date_rank ON daily_drops(market, drop_date DESC, rank);
  CREATE INDEX IF NOT EXISTS idx_daily_drops_product ON daily_drops(product_id, drop_date DESC);
`);

// Remove preview records and their dependent snapshots so stale demo cards
// cannot return after a deployment restart. Verified retailer data is kept.
db.transaction(() => {
  const demoIds = "SELECT id FROM products WHERE LOWER(COALESCE(source,''))='demo'";
  db.prepare(`DELETE FROM daily_drops WHERE product_id IN (${demoIds})`).run();
  db.prepare(`DELETE FROM price_history WHERE product_id IN (${demoIds})`).run();
  db.prepare(`DELETE FROM clicks WHERE product_id IN (${demoIds})`).run();
  db.prepare("DELETE FROM products WHERE LOWER(COALESCE(source,''))='demo'").run();
})();

// Seed one observation for existing products so price intelligence works
// immediately after deployment without discarding any catalog data.
db.exec(`
  INSERT INTO price_history(product_id, price, original_price, currency, source, observed_at)
  SELECT p.id, p.current_price, p.original_price, COALESCE(NULLIF(p.currency,''),'USD'), p.source,
         COALESCE(NULLIF(p.updated_at,''), datetime('now'))
  FROM products p
  WHERE p.current_price IS NOT NULL
    AND p.current_price > 0
    AND NOT EXISTS (SELECT 1 FROM price_history h WHERE h.product_id=p.id);
`);

console.log(`Database: ${dbPath}`);
module.exports = db;
