/*
 * "It's live now": once per address, only in the first minutes, to everyone
 * who asked and to the subscriber list. On the real schema.
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
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-live-now-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { sendLiveNowNotices } = require("../src/liveDrop");

const start = Date.parse("2026-09-17T00:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
db.prepare("INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
  .run("drop_now", "us", "Milwaukee kit", iso(start), iso(start + 600000), 1, iso(start - 86400000), iso(start - 86400000));
db.prepare("INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
  .run("drop_draft", "us", "Draft", iso(start), iso(start + 600000), 0, iso(start - 86400000), iso(start - 86400000));

const subscriber = (email, status = "active", market = "us") =>
  db.prepare("INSERT INTO subscribers(email,categories,status,source,market,unsubscribe_token,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(email, "[]", status, "homepage", market, `tok-${email}`, iso(start - 1e9), iso(start - 1e9));
subscriber("fan@example.com");
subscriber("both@example.com");
subscriber("gone@example.com", "unsubscribed");
subscriber("uk@example.com", "active", "uk");
db.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(1,?,?)").run("Both@Example.com", iso(start - 3600000));
db.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(1,?,?)").run("asker@example.com", iso(start - 3600000));

(async () => {
  const sent = [];
  let failOnce = "fan@example.com";
  const sendLiveNow = async (message) => {
    if (message.email === failOnce) {
      failOnce = "";
      throw new Error("provider down");
    }
    sent.push(message);
  };
  const logger = { error() {} };

  /* Before it opens: nothing. */
  assert.strictEqual(await sendLiveNowNotices({ db, sendLiveNow, now: start - 30000, logger }), 0);

  /* One minute in. */
  assert.strictEqual(await sendLiveNowNotices({ db, sendLiveNow, now: start + 60000, unsubscribeUrlFor: (row) => `https://x/unsub/${row.unsubscribe_token}`, logger }), 2);
  const byEmail = Object.fromEntries(sent.map((message) => [message.email, message]));
  assert.ok(byEmail["asker@example.com"]?.asked, "someone who pressed Remind me was not told");
  assert.ok(byEmail["both@example.com"]?.asked, "a subscriber who also asked got the marketing version");
  assert.strictEqual(byEmail["both@example.com"].unsubscribeUrl, "", "an email they asked for offered an unsubscribe");
  assert.ok(!byEmail["gone@example.com"], "an unsubscribed address was emailed");
  assert.ok(!byEmail["uk@example.com"], "another market's list was emailed");

  /* The failed send is retried on the next sweep, and nobody gets a second. */
  assert.strictEqual(await sendLiveNowNotices({ db, sendLiveNow, now: start + 120000, unsubscribeUrlFor: (row) => `https://x/unsub/${row.unsubscribe_token}`, logger }), 1);
  assert.strictEqual(sent.at(-1).email, "fan@example.com");
  assert.strictEqual(sent.at(-1).asked, false);
  assert.strictEqual(sent.at(-1).unsubscribeUrl, "https://x/unsub/tok-fan@example.com");
  assert.strictEqual(await sendLiveNowNotices({ db, sendLiveNow, now: start + 150000, logger }), 0, "someone was told twice");
  assert.strictEqual(sent.length, 3);

  /* Too late to be useful: a new subscriber seven minutes in hears nothing. */
  subscriber("late@example.com");
  assert.strictEqual(await sendLiveNowNotices({ db, sendLiveNow, now: start + 7 * 60000, logger }), 0);

  console.log("Live-now emails passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
