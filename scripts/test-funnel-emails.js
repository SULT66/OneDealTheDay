const assert = require("assert");
const Database = require("better-sqlite3");
const { sendStagedReminders, announceDropToSubscribers } = require("../src/liveDrop");
const { sendDuePriceDrops } = require("../src/priceWatches");

/*
 * The three mails that turn a visit into somebody who comes back.
 *
 * Before these, a drop was announced by exactly one message ten minutes ahead,
 * and only to people already standing on the drop page. The subscriber list and
 * the drop were unconnected — somebody could subscribe on Monday and never
 * learn a drop happened on Thursday — and a shopper who liked a product but was
 * not buying today had no way to be told when its price moved.
 */

const db = new Database(":memory:");
db.exec(`
  /* The product columns are here because the emails now show the thing being
     sold — its picture, its shop and its usual price. A fixture narrower than
     the real table stopped the query dead, which is how this one earned them. */
  CREATE TABLE live_drops(
    id INTEGER PRIMARY KEY, title TEXT, market TEXT, start_at TEXT, published INTEGER,
    brand TEXT, retailer_name TEXT, image_url TEXT, retail_price REAL, currency TEXT
  );
  CREATE TABLE live_drop_reminders(
    id INTEGER PRIMARY KEY, drop_id INTEGER, email TEXT,
    reminded_at TEXT, reminded_day_before_at TEXT, reminded_hour_before_at TEXT
  );
  CREATE TABLE subscribers(id INTEGER PRIMARY KEY, email TEXT, status TEXT, market TEXT, unsubscribe_token TEXT);
  CREATE TABLE live_drop_announcements(
    id INTEGER PRIMARY KEY AUTOINCREMENT, drop_id INTEGER, subscriber_id INTEGER, sent_at TEXT,
    UNIQUE(drop_id, subscriber_id)
  );
  CREATE TABLE products(id INTEGER PRIMARY KEY, title TEXT, current_price REAL, currency TEXT, market TEXT, status TEXT);
  CREATE TABLE price_watches(
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, email TEXT, market TEXT,
    price_when_asked REAL, created_at TEXT, notified_at TEXT
  );
`);

const now = Date.UTC(2026, 8, 10, 12, 0, 0);
const at = (hours) => new Date(now + hours * 3600 * 1000).toISOString();

/* Columns named rather than positional: a bare VALUES list breaks the day
   the table grows, which is exactly what happened here. */
db.prepare("INSERT INTO live_drops(id,title,market,start_at,published,brand,retailer_name,image_url,retail_price,currency) VALUES(1,'Ninja Creami','us',?,1,'Ninja','eBay','https://example.com/creami.jpg',229.99,'USD')").run(at(24));
db.prepare("INSERT INTO live_drops(id,title,market,start_at,published) VALUES(2,'Unpublished','us',?,0)").run(at(24));
db.prepare("INSERT INTO live_drop_reminders(id,drop_id,email) VALUES(1,1,'waiting@example.com')").run();
db.prepare("INSERT INTO live_drop_reminders(id,drop_id,email) VALUES(2,2,'onadraft@example.com')").run();

(async () => {
  /* ---------------------------------------- a day out, then an hour out */

  const dayBefore = [];
  const hourBefore = [];
  const stage = (options) => sendStagedReminders({
    db,
    sendSaveTheDate: async (m) => { dayBefore.push(m); },
    sendStartingSoon: async (m) => { hourBefore.push(m); },
    logger: { error() {} },
    ...options,
  });

  assert.strictEqual(await stage({ now }), 1, "the day-before reminder did not go out");
  assert.strictEqual(dayBefore[0].email, "waiting@example.com", "it went to the wrong person");
  /* A drop nobody published is a drop nobody has decided to announce. */
  assert(
    !dayBefore.concat(hourBefore).some((m) => m.email === "onadraft@example.com"),
    "a draft drop was announced to the people waiting on it",
  );

  /* Same sweep again changes nothing: each stage carries its own stamp. */
  assert.strictEqual(await stage({ now }), 0, "the same reminder was sent twice");

  /* An hour out, the second stage fires and the first stays quiet. */
  assert.strictEqual(await stage({ now: now + 23 * 3600 * 1000 }), 1, "the hour-before reminder did not go out");
  assert.strictEqual(hourBefore.length, 1, "the hour-before reminder went out more than once");
  assert.strictEqual(dayBefore.length, 1, "the day-before reminder fired a second time");

  /* --------------------------------------------- the subscriber list */

  db.prepare("INSERT INTO subscribers VALUES(1,'sub@example.com','active','us','tok-1')").run();
  db.prepare("INSERT INTO subscribers VALUES(2,'gone@example.com','unsubscribed','us','tok-2')").run();
  db.prepare("INSERT INTO subscribers VALUES(3,'uk@example.com','active','uk','tok-3')").run();

  const announced = [];
  const announce = () => announceDropToSubscribers({
    db,
    sendAnnouncement: async (m) => { announced.push(m); },
    unsubscribeUrlFor: (s) => `https://x/unsubscribe?token=${s.unsubscribe_token}`,
    now,
    logger: { error() {} },
  });

  assert.strictEqual(await announce(), 1, "the subscriber list was not told about the drop");
  assert.strictEqual(announced[0].email, "sub@example.com", "the wrong subscriber was told");
  /* Somebody who left stays left, and a market that is not running this drop
     is not somebody else's audience. */
  assert(!announced.some((m) => m.email === "gone@example.com"), "an unsubscribed address was mailed");
  assert(!announced.some((m) => m.email === "uk@example.com"), "another market's subscribers were mailed");
  /* Marketing, so it carries the way out. */
  assert(/unsubscribe\?token=tok-1/.test(announced[0].unsubscribeUrl), "the announcement has no unsubscribe link");

  /* Told once, never chased. */
  assert.strictEqual(await announce(), 0, "the subscriber list was told twice about one drop");

  /* ------------------------------------------------------ a price falls */

  db.prepare("INSERT INTO products VALUES(1,'Cat Tree',46.19,'USD','us','published')").run();
  db.prepare("INSERT INTO products VALUES(2,'Withdrawn',10.00,'USD','us','archived')").run();
  db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at) VALUES(1,'watcher@example.com','us',80,?)").run(at(-48));
  db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at) VALUES(2,'watcher@example.com','us',80,?)").run(at(-48));
  /* Barely moved, which is not news: an email for four cents teaches somebody
     to ignore the next one. */
  db.prepare("INSERT INTO products VALUES(3,'Barely',99.00,'USD','us','published')").run();
  db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at) VALUES(3,'watcher@example.com','us',99.5,?)").run(at(-48));

  const drops = [];
  const run = (send) => sendDuePriceDrops({
    db,
    sendPriceDrop: send || (async (m) => { drops.push(m); }),
    dealPathFor: (w) => `/us/deal/${w.product_id}`,
    now,
    logger: { error() {} },
  });

  assert.strictEqual(await run(), 1, "a real price drop was not reported");
  assert.strictEqual(drops[0].was, "80.00", "the comparison is not against the price on the day they asked");
  assert.strictEqual(drops[0].now, "46.19", "the new price is wrong");
  /* A watch on something withdrawn is not news, and a link to a page that
     answers 410 is worse than silence. */
  assert.strictEqual(drops.length, 1, "a withdrawn listing or a rounding change was mailed about");

  assert.strictEqual(await run(async () => { throw new Error("twice"); }), 0, "the same price drop was mailed twice");

  console.log("Funnel email checks passed: two stages, one announcement, one price drop, none of them twice.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
