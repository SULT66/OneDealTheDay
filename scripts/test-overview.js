/*
 * The admin overview, checked against the real schema.
 *
 * The database is built by requiring src/db.js rather than by hand-writing the
 * tables here, and that is the whole point of the test: a hand-written fixture
 * would agree with whatever column names the queries happen to use, including
 * the wrong ones. Every count in this file is a column name that has to exist
 * where the site actually keeps it, so renaming one and forgetting the panel
 * fails here rather than showing a zero on the screen — which is the failure
 * that matters, because a zero looks like an answer.
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
      all:(...params) => statement.all(...params),
      get:(...params) => statement.get(...params),
      run:(...params) => statement.run(...params)
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-overview-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { overview } = require("../src/overview");

const now = Date.parse("2026-09-08T12:00:00.000Z");
const inWindow = "2026-08-20T12:00:00.000Z";
const longAgo = "2026-01-01T12:00:00.000Z";

db.prepare("INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
  .run("new@example.com", "[]", "active", "homepage", "us", inWindow, inWindow);
db.prepare("INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
  .run("old@example.com", "[]", "active", "homepage", "us", longAgo, longAgo);
db.prepare("INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
  .run("gone@example.com", "[]", "unsubscribed", "homepage", "us", longAgo, longAgo);

db.prepare("INSERT INTO users(email,name,password_hash,membership,market,created_at) VALUES(?,?,?,?,?,?)")
  .run("a@example.com", "A", "x", "free", "us", inWindow);
db.prepare("INSERT INTO users(email,name,password_hash,membership,market,created_at,google_sub) VALUES(?,?,?,?,?,?,?)")
  .run("b@example.com", "B", "x", "free", "us", longAgo, "sub-1");

const product = db.prepare(`INSERT INTO products(
  external_id,market,title,retailer_name,current_price,original_price,currency,status,rating,review_count,
  updated_at,first_seen_at,last_seen_at
) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);

product.run("p1", "us", "Reviewed thing", "eBay", 40, 60, "USD", "published", 4.5, 12, inWindow, inWindow, inWindow);
product.run("p2", "us", "Unreviewed thing", "FED Fitness", 40, null, "USD", "published", 0, 0, inWindow, inWindow, inWindow);
/* A draft is not part of the catalogue anybody can see, so it must not be
   counted in it. */
product.run("p3", "us", "Draft thing", "FED Fitness", 40, 90, "USD", "candidate", 4.9, 40, inWindow, inWindow, inWindow);
/*
 * Rated, and still not scoreable.
 *
 * Two five-star reviews is an anecdote, and the site refuses to build a score
 * on one — so a shop whose feed carries ratings can still be sending nothing
 * usable. Counting "has a rating" here would have reported that shop as fine.
 */
product.run("p4", "us", "Barely reviewed thing", "Giftlab", 40, 55, "USD", "published", 5, 2, inWindow, inWindow, inWindow);

db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at,notified_at) VALUES(?,?,?,?,?,?)")
  .run(1, "watch@example.com", "us", 40, inWindow, null);
db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at,notified_at) VALUES(?,?,?,?,?,?)")
  .run(2, "watch@example.com", "us", 40, inWindow, inWindow);

db.prepare("INSERT INTO saved_offers(user_id,url,title,retailer,price_value,currency,market,saved_at) VALUES(?,?,?,?,?,?,?,?)")
  .run(1, "https://example.com/x", "Saved thing", "eBay", 40, "USD", "us", inWindow);

const click = db.prepare(`INSERT INTO clicks(session_id,product_id,market,retailer_name,source_page,placement,action_type,destination_type,clicked_at)
  VALUES(?,?,?,?,?,?,?,?,?)`);
click.run("session-a", 1, "us", "eBay", "deal", "hero", "view_deal", "retailer", inWindow);
/* A click with no session id: every product and store link sent these until
   ClickAttribution started stamping them. It is a click, and it is nobody —
   counting the empty string as a session reported 4,895 of them as one
   visitor. */
click.run("", 1, "us", "eBay", "deal", "hero", "view_deal", "retailer", inWindow);
click.run("session-a", 1, "us", "eBay", "deal", "hero", "shop_all", "retailer", inWindow);
click.run("session-b", 2, "us", "eBay", "deal", "hero", "shop_all", "retailer", inWindow);
/* Outside the window, and an internal click that never left the site: neither
   is somebody arriving at a shop. */
click.run("session-c", 1, "us", "eBay", "deal", "hero", "shop_all", "retailer", longAgo);
click.run("session-d", 1, "us", "eBay", "listing", "card", "view_deal", "internal", inWindow);

db.prepare(`INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?)`).run("drop-1", "us", "A drop", inWindow, inWindow, 1, inWindow, inWindow);
db.prepare(`INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?)`).run("drop-2", "us", "A draft drop", inWindow, inWindow, 0, inWindow, inWindow);

const dropEvent = db.prepare("INSERT INTO live_drop_events(drop_id,market,event_type,session_id,occurred_at) VALUES(?,?,?,?,?)");
dropEvent.run(1, "us", "waiting_room", "session-a", inWindow);
dropEvent.run(1, "us", "reveal", "session-a", inWindow);
dropEvent.run(1, "us", "buy_click", "session-a", inWindow);
dropEvent.run(1, "us", "waiting_room", "session-b", inWindow);

/*
 * A second drop the same person also looked at. This is the shape that broke
 * the funnel: the top step counted distinct people and every step under it
 * counted rows, so one visitor across two drops read as one who arrived and
 * two who saw the price — "7 reached, 16 saw the price", which cannot happen
 * and makes the whole screen untrustworthy.
 */
db.prepare(`INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?,?)`).run("drop-3", "us", "Another drop", inWindow, inWindow, 1, inWindow, inWindow);
dropEvent.run(3, "us", "reveal", "session-a", inWindow);
dropEvent.run(3, "us", "buy_click", "session-a", inWindow);

db.prepare(`INSERT INTO live_drop_reminders(drop_id,email,created_at,reminded_at,reminded_day_before_at,reminded_hour_before_at)
  VALUES(?,?,?,?,?,?)`).run(1, "one@example.com", inWindow, inWindow, inWindow, null);
db.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(?,?,?)")
  .run(1, "two@example.com", inWindow);

db.prepare("INSERT INTO live_drop_announcements(drop_id,subscriber_id,sent_at) VALUES(?,?,?)").run(1, 1, inWindow);

const numbers = overview(db, {days:30, now});

assert.strictEqual(numbers.days, 30);
assert.strictEqual(numbers.audience.subscribers, 2, "active subscribers, unsubscribed excluded");
assert.strictEqual(numbers.audience.unsubscribed, 1);
assert.strictEqual(numbers.audience.subscribedInWindow, 1, "only the one who joined inside the window");
assert.strictEqual(numbers.audience.accounts, 2);
assert.strictEqual(numbers.audience.accountsInWindow, 1);
assert.strictEqual(numbers.audience.accountsViaGoogle, 1);

assert.strictEqual(numbers.intent.savedProducts, 1);
assert.strictEqual(numbers.intent.priceWatches, 2);
assert.strictEqual(numbers.intent.priceWatchesWaiting, 1);
assert.strictEqual(numbers.intent.priceWatchesTold, 1);

assert.strictEqual(numbers.outbound.total, 4, "in the window, and only clicks that left for a shop");
assert.strictEqual(numbers.outbound.unattributed, 1, "the click with no session is reported, not hidden");
assert.strictEqual(numbers.outbound.toAProduct, 2);
assert.strictEqual(numbers.outbound.toAShop, 2);
assert.strictEqual(numbers.engagedSessions, 2, "two real sessions — the empty one is not a third person");

assert.strictEqual(numbers.live.drops, 3);
assert.strictEqual(numbers.live.published, 2);
assert.strictEqual(numbers.live.reached, 2, "distinct people, not events");
assert.strictEqual(numbers.live.sawThePrice, 1, "one person saw a price, on two drops — not two");
assert.strictEqual(numbers.live.wentToBuy, 1, "and one went to buy, on however many drops");
/* The property the whole change exists for: the steps are comparable. */
assert.ok(numbers.live.sawThePrice <= numbers.live.reached, "a step can never exceed the one above it");
assert.ok(numbers.live.wentToBuy <= numbers.live.sawThePrice, "nor the one above that");
assert.strictEqual(numbers.live.remindersAsked, 2);
assert.strictEqual(numbers.live.remindersSent, 2, "two stages sent for one person, none for the other");
assert.strictEqual(numbers.live.announcementsSent, 1);

assert.strictEqual(numbers.catalogue.listings, 3, "published only");
assert.strictEqual(numbers.catalogue.withReviews, 2);

/*
 * Per shop, because that is where the number is actionable: a shop can be
 * connected, ingesting nightly and incapable of ever producing a pick.
 */
const byShop = Object.fromEntries(numbers.catalogue.shops.map((shop) => [shop.shop, shop]));
assert.deepStrictEqual(byShop["eBay"], {
  shop: "eBay",
  listings: 1,
  canBeScored: 1,
  canStateASaving: 1,
});
/* The whole point of the table: listings arriving, none of them usable. */
assert.deepStrictEqual(byShop["FED Fitness"], {
  shop: "FED Fitness",
  listings: 1,
  canBeScored: 0,
  canStateASaving: 0,
});
assert.strictEqual(byShop["Giftlab"].canBeScored, 0, "two reviews is not evidence");
assert.strictEqual(byShop["Giftlab"].canStateASaving, 1);
/* Drafts are not in the shop table either, or a shop would look busier than
   the catalogue it actually contributes to. */
assert.strictEqual(byShop["FED Fitness"].listings, 1, "the candidate row must not be counted");

/* A shorter window has to move the numbers that are windowed and leave the
   standing totals alone — the panel labels them differently and would be
   lying if they behaved the same. */
const week = overview(db, {days:7, now});
assert.strictEqual(week.audience.subscribedInWindow, 0, "the joiner is 7 days outside a 7 day window");
assert.strictEqual(week.audience.subscribers, 2, "how many subscribers there are does not depend on the window");
assert.strictEqual(week.outbound.total, 0);
assert.strictEqual(week.intent.priceWatches, 2);

/* The gaps are stated on the payload itself rather than only in the panel, so
   a second reader of this endpoint cannot mistake silence for zero. */
assert.ok(numbers.notMeasuredHere.some(line => /visitor/i.test(line)), "says visitors are not counted");
assert.ok(numbers.notMeasuredHere.some(line => /unattributed/i.test(line)), "says unattributed clicks are not people");
assert.ok(numbers.notMeasuredHere.some(line => /purchase|commission/i.test(line)), "says purchases are not counted");

/* Nothing here is allowed to call an engaged session a visitor. The number is
   sessions that produced a click, which undercounts everyone who looked and
   left, and naming it traffic would make every rate below it wrong. */
assert.ok(!("visitors" in numbers), "no field claims to count visitors");

console.log("overview: ok");

/* The database is still open, and on Windows that makes the file unremovable.
   The temp directory is the operating system's to clean up; failing the test
   over it would report a passing check as broken. */
try { fs.rmSync(process.env.DATA_DIR, {recursive:true, force:true}); } catch {}
Module._load = originalLoad;
