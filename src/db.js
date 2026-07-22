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
    rating REAL,
    review_count INTEGER,
    current_price REAL,
    original_price REAL,
    currency TEXT,
    badge TEXT,
    score REAL,
    source TEXT,
    status TEXT,
    updated_at TEXT
  );
  CREATE TABLE IF NOT EXISTS refresh_runs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT,
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
`);

const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map(column => column.name));
for (const column of ["product_key", "upc", "gtin", "model_number", "brand", "brand_slug", "manufacturer", "mpn", "ean"]) {
  if (!productColumns.has(column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT`);
}

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
  CREATE INDEX IF NOT EXISTS idx_products_category_score ON products(category, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_score ON products(brand_slug, score DESC);
  CREATE INDEX IF NOT EXISTS idx_products_brand_name ON products(brand);
  CREATE INDEX IF NOT EXISTS idx_price_history_product_date ON price_history(product_id, observed_at DESC);
`);

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
