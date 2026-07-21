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
`);

const productColumns = new Set(db.prepare("PRAGMA table_info(products)").all().map(column => column.name));
for (const column of ["product_key", "upc", "gtin", "model_number"]) {
  if (!productColumns.has(column)) db.exec(`ALTER TABLE products ADD COLUMN ${column} TEXT`);
}

console.log(`Database: ${dbPath}`);
module.exports = db;
