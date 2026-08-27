const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "src", "db.js"), "utf8");

/* The same schema the app creates, lifted from db.js rather than retyped, so a
   change there that breaks these guarantees fails here instead of in
   production. */
const schema = /CREATE TABLE IF NOT EXISTS saved_offers\([\s\S]*?\);/.exec(dbSource);
assert(schema, "saved_offers is no longer declared where this test looks for it");
const index = /CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_offers_user_url[^;]*;/.exec(dbSource);
assert(index, "the unique index on saved_offers is gone, so a shopper can save the same product twice");

const db = new Database(":memory:");
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT);
  ${schema[0]}
  ${index[0]}`);
db.prepare("INSERT INTO users(id,email) VALUES(1,'first@example.com'),(2,'second@example.com')").run();

const save = (userId, url, title = "A television") =>
  db.prepare(`INSERT INTO saved_offers(user_id,url,title,retailer,price_value,currency,image_url,catalog_product_id,market,saved_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(userId, url, title, "Best Buy", 799.99, "USD", "", 0, "us", new Date().toISOString());

const offer = "https://www.bestbuy.com/product/tv/12345.p";
const first = save(1, offer);

/* Tapping the heart twice is one product, not two. */
assert.throws(
  () => save(1, offer),
  /UNIQUE/,
  "the same shopper could save the same product twice",
);

/* Two people can want the same television. */
assert.doesNotThrow(
  () => save(2, offer),
  "two different shoppers could not save the same product",
);

/*
 * The one that matters. A delete carries an id from the browser, and an id
 * from somebody else's list must remove nothing rather than their saved
 * product.
 */
const removedByStranger = db.prepare("DELETE FROM saved_offers WHERE id=? AND user_id=?")
  .run(first.lastInsertRowid, 2);
assert.strictEqual(
  removedByStranger.changes,
  0,
  "one shopper deleted another shopper's saved product",
);
assert.strictEqual(
  db.prepare("SELECT COUNT(*) AS total FROM saved_offers WHERE user_id=1").get().total,
  1,
  "the owner's saved product disappeared",
);

const removedByOwner = db.prepare("DELETE FROM saved_offers WHERE id=? AND user_id=?")
  .run(first.lastInsertRowid, 1);
assert.strictEqual(removedByOwner.changes, 1, "the owner could not remove their own saved product");

/* Guarded at the route as well as in the SQL, because either one alone is a
   single edit away from being someone else's list. */
assert(
  /app\.get\("\/api\/saved", requireUser/.test(serverSource) &&
    /app\.post\("\/api\/saved", requireUser/.test(serverSource) &&
    /app\.delete\("\/api\/saved\/:id", requireUser/.test(serverSource),
  "a saved-offers route stopped requiring a signed-in shopper",
);
assert(
  /DELETE FROM saved_offers WHERE id=\? AND user_id=\?/.test(serverSource),
  "the delete is no longer scoped to the signed-in shopper",
);
/* saved_offers has to stay on the list of tables that trigger an immediate
   snapshot. Losing somebody's saved list to the ten minute window is exactly
   the loss that list exists to prevent. */
assert(
  /saved_offers/.test(fs.readFileSync(path.join(__dirname, "..", "src", "dbStorage.js"), "utf8")),
  "saved offers are no longer snapshotted straight after being written",
);

console.log("Saved offers: duplicate, ownership and durability guarantees passed.");
