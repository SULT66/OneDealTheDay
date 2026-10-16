/*
 * The letter to a subscriber nothing has ever come back from.
 *
 * Built on the real schema from src/db.js, the way test-weekly-digest.js is,
 * because every clause of the selection names a column in a different table
 * and the whole point of this letter is that it rests on data that actually
 * exists. A query naming a column that is not there has to fail here, not on
 * a Tuesday morning against the live list.
 *
 * Two assertions carry the honesty of the thing and are worth naming:
 *
 *   - nothing in the selection asks about opens, because the system records
 *     none and src/mailer.js deliberately keeps it that way;
 *   - a percentage appears under a listing only where tracked_drop_percent
 *     recorded the fall.
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-reactivation-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { digestEvidence } = require("../src/digestSelection");
const {
  MISSED_ITEMS,
  QUIET_DAYS,
  REACTIVATION_STEP,
  dormantSubscribers,
  missedItemsFor,
  monthsSince,
  sendReactivationEmails,
} = require("../src/reactivation");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

const DAY = 24 * 3600 * 1000;
const NOW = Date.parse("2026-10-20T15:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const daysAgo = (days) => iso(NOW - days * DAY);

/* ------------------------------------------- the metric we do not have */

/*
 * This was asked for as "sixty days without an open". There is no such
 * column, no such table, and src/mailer.js turns SendGrid's open pixel off on
 * purpose — the drop letters were landing in Promotions with it on. A rule
 * written in opens would have to be invented, so the rule is written in the
 * actions the database does record and the letter says so in those words.
 */
const reactivationSource = read("src", "reactivation.js");
const mailerSource = read("src", "mailer.js");
assert(
  /open_tracking: *\{ *enable: *false *\}/.test(mailerSource),
  "open tracking has been switched on; this letter's wording and this file's premise both need rewriting",
);
assert(
  !/\bopen(?:ed|s|_at|_count)?\b *(?:=|>|<|IS)/i.test(reactivationSource.replace(/\/\*[\s\S]*?\*\//g, "")),
  "the selection queries an open, and the system records none",
);

/* ---------------------------------------------------------- the schema */

const subscriberColumns = new Set(db.prepare("PRAGMA table_info(subscribers)").all().map((column) => column.name));
assert(subscriberColumns.has("drop_opt_in"), "there is no per-drop setting, so 'fewer emails' has nothing to turn off");

/*
 * The retired column. Nothing may write it again: a column that is filled and
 * never read is what this change existed to end, and the next person to see a
 * populated `categories` will reasonably assume something reads it.
 */
const serverSource = read("src", "server.js");
assert(
  !/INSERT INTO subscribers\([^)]*\bcategories\b/.test(serverSource),
  "something writes subscribers.categories again, and nothing anywhere reads it",
);
assert(
  !/\bcategories\b/.test(/app\.post\("\/api\/subscribe"[\s\S]*?\n\}\);/.exec(serverSource)[0].replace(/\/\*[\s\S]*?\*\//g, "")),
  "the subscribe route is collecting categories again",
);

/* ------------------------------------------------------------ the list */

const subscriber = (email, { createdDays = 120, digestOptIn = 0, dropOptIn = 1, welcomed = true } = {}) => {
  db.prepare(
    `INSERT INTO subscribers(email,status,source,market,unsubscribe_token,digest_opt_in,drop_opt_in,created_at,updated_at)
     VALUES(?,'active','homepage','us',?,?,?,?,?)`,
  ).run(email, `token-${email}`, digestOptIn, dropOptIn, daysAgo(createdDays), daysAgo(createdDays));
  const id = db.prepare("SELECT id FROM subscribers WHERE email=?").get(email).id;
  if (welcomed) {
    db.prepare("INSERT INTO subscriber_sequence(subscriber_id,step,sent_at) VALUES(?,'digest_invite',?)")
      .run(id, daysAgo(createdDays - 7));
  }
  return id;
};

const dormantId = subscriber("dormant@example.test");
subscriber("yesterday@example.test", { createdDays: 3 });
subscriber("reader@example.test", { digestOptIn: 1 });
subscriber("already-slowed@example.test", { dropOptIn: 0 });
subscriber("never-written-to@example.test", { welcomed: false });

const watcherId = subscriber("watcher@example.test");
const reminderId = subscriber("reminded@example.test");
const accountId = subscriber("member@example.test");

db.prepare("INSERT INTO products(id,market,title,status,current_price,currency,image_url) VALUES(1,'us','Watched','published',10,'USD','https://example.test/1.jpg')").run();
db.prepare("INSERT INTO price_watches(product_id,email,market,price_when_asked,created_at) VALUES(1,?,'us',10,?)")
  .run("Watcher@Example.test", daysAgo(90));
db.prepare("INSERT INTO live_drops(id,drop_key,market,title,published,start_at,end_at,created_at,updated_at) VALUES(1,'a-drop','us','A drop',1,?,?,?,?)")
  .run(daysAgo(30), daysAgo(30), daysAgo(40), daysAgo(40));
db.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(1,?,?)")
  .run("REMINDED@example.test", daysAgo(31));
db.prepare("INSERT INTO users(email,name,password_hash,created_at) VALUES(?,'A','x',?)")
  .run("Member@example.test", daysAgo(50));

const dormant = dormantSubscribers(db, { now: NOW }).map((row) => row.email);

assert.deepStrictEqual(dormant, ["dormant@example.test"], `the dormant list is wrong: ${dormant.join(", ")}`);
assert(!dormant.includes("yesterday@example.test"), `somebody ${QUIET_DAYS} days short of quiet was written to`);
assert(!dormant.includes("reader@example.test"), "somebody who clicked the link in the day-seven letter was called dormant");
assert(!dormant.includes("already-slowed@example.test"), "somebody who already asked for fewer emails was asked again");
assert(!dormant.includes("never-written-to@example.test"), "somebody we never finished writing to was asked why they are quiet");

/* The address columns differ in collation between tables, so every one of
   these is a lower() on both sides or the join silently misses. */
assert(!dormant.includes("watcher@example.test"), "a shopper watching a price was called dormant");
assert(!dormant.includes("reminded@example.test"), "a shopper who asked for a drop reminder was called dormant");
assert(!dormant.includes("member@example.test"), "somebody with an account was called dormant");
void watcherId; void reminderId; void accountId;

/* ------------------------------------------------- what they missed */

const presented = new Map();
const sunday = (id, { score = 90, drop = 0, sentDays = 30, published = true } = {}) => {
  db.prepare("INSERT INTO digest_items(product_id,market,position,score,sent_at) VALUES(?,'us',1,?,?)")
    .run(id, score, daysAgo(sentDays));
  if (published) {
    presented.set(id, {
      id,
      title: `Listing ${id}`,
      deal_url: `/us/deal/${id}`,
      image_url: `https://example.test/${id}.jpg`,
      current_price: 24.99,
      currency: "USD",
      public_category: "Office",
      display_score: score,
      tracked_drop_percent: drop,
      rating: 0,
      review_count: 0,
    });
  }
};

/* One of them has a measured fall, one has none, and one went off sale. */
sunday(11, { drop: 23, sentDays: 40 });
sunday(12, { drop: 0, sentDays: 35 });
sunday(13, { drop: 0, sentDays: 20, published: false });
sunday(14, { drop: 0, sentDays: 10 });
/* Sent before this subscriber ever joined, so they did not miss it. */
sunday(15, { drop: 0, sentDays: 200 });

const row = db.prepare("SELECT id, email, created_at FROM subscribers WHERE id=?").get(dormantId);
const missed = missedItemsFor(db, row, { presented, market: "us", siteOrigin: "https://www.onedailydrop.com" });

assert.strictEqual(missed.length, MISSED_ITEMS, "the letter did not get its three listings");
assert.deepStrictEqual(missed.map((item) => item.id), [14, 12, 11], "the missed listings are not the most recent Sundays");
assert(
  !missed.some((item) => item.id === 13),
  "a listing that has gone off sale was still shown as something to buy",
);
assert(
  !missed.some((item) => item.id === 15),
  "a Sunday from before they joined was presented as something they missed",
);

/* --------------------------------- the percentage, only where measured */

const withDrop = missed.find((item) => item.id === 11);
const withoutDrop = missed.find((item) => item.id === 12);
assert(
  withDrop.reasons.some((reason) => reason.includes("23% below")),
  "a fall we recorded ourselves was not stated",
);
assert(
  !withoutDrop.reasons.some((reason) => /%/.test(reason)),
  "a percentage appeared under a listing whose fall we never measured",
);
assert.deepStrictEqual(
  digestEvidence({ tracked_drop_percent: 0, original_price: 99, current_price: 40 }),
  [],
  "a retailer's own crossed-out price was turned into a discount claim",
);

(async function main() {
/* ------------------------------------------------------------- the send */

const sentTo = [];
const sendReactivation = async (message) => { sentTo.push(message); };

const first = await sendReactivationEmails({
  db,
  market: "us",
  products: [...presented.values()],
  sendReactivation,
  now: NOW,
  fewerUrlFor: (s) => `https://www.onedailydrop.com/email/less?token=${s.unsubscribe_token}`,
  unsubscribeUrlFor: (s) => `https://www.onedailydrop.com/unsubscribe?token=${s.unsubscribe_token}`,
});

assert.strictEqual(first.sent, 1, "the letter did not go to the one subscriber owed it");
assert.strictEqual(sentTo[0].email, "dormant@example.test", "it went to the wrong address");
assert.strictEqual(sentTo[0].items.length, 3, "the letter went out without its three listings");
assert(sentTo[0].fewerUrl.includes("/email/less"), "the letter carries no way to ask for fewer emails");
assert(sentTo[0].unsubscribeUrl.includes("/unsubscribe"), "a marketing email went out with no way off the list");
assert(sentTo[0].months >= 3, `the letter misstates how long they have been on the list: ${sentTo[0].months}`);

/* Once, ever. Asking the same question twice is what earns a spam report. */
const second = await sendReactivationEmails({
  db, market: "us", products: [...presented.values()], sendReactivation, now: NOW + 30 * DAY,
});
assert.strictEqual(second.sent, 0, "the same subscriber was asked the same question twice");
assert.strictEqual(
  db.prepare("SELECT COUNT(*) n FROM subscriber_sequence WHERE step=?").get(REACTIVATION_STEP).n,
  1,
  "a second row was recorded for a letter that may only be sent once",
);

/* ------------------------------- fewer than three is not an email at all */

db.prepare("DELETE FROM subscriber_sequence WHERE step=?").run(REACTIVATION_STEP);
db.prepare("DELETE FROM digest_items WHERE product_id IN (12,14)").run();
sentTo.length = 0;
const thin = await sendReactivationEmails({
  db, market: "us", products: [...presented.values()], sendReactivation, now: NOW,
});
assert.strictEqual(thin.sent, 0, "a letter whose argument is 'here is what you missed' went out with one card");
assert.strictEqual(thin.skipped, 1, "the subscriber was not held back for a later week");
assert.strictEqual(
  db.prepare("SELECT COUNT(*) n FROM subscriber_sequence WHERE step=?").get(REACTIVATION_STEP).n,
  0,
  "a letter that was never sent was recorded as sent, so it can never be sent",
);

/* ------------------------------------------------------------ the clock */

assert.strictEqual(monthsSince(daysAgo(65), NOW), 2, "two months on the list did not read as two months");
assert.strictEqual(monthsSince(daysAgo(QUIET_DAYS), NOW), 2, "the quiet period itself rounded oddly");
assert.strictEqual(monthsSince(daysAgo(20), NOW), 1, "a short stay was reported as zero months");

console.log("Reactivation checks passed: dormant by recorded action, three real missed listings, percentages only where measured, once per subscriber.");
})().catch((error) => { console.error(error); process.exit(1); });
