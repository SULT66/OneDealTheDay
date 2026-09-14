/*
 * Growth: the same numbers for any window, the previous window beside them,
 * and a weekly snapshot that is taken once and never changes.
 *
 * Built on the real schema (src/db.js), like test-overview.js, so a query
 * naming a column that does not exist fails here instead of printing a zero.
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-growth-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { overview } = require("../src/overview");
const { pageViewRow } = require("../src/pageViews");
const {
  ensureWeeklySnapshot,
  lastCompletedWeek,
  listWeeklySnapshots,
  nextWeekClose,
  periodMetrics,
} = require("../src/growthMetrics");

/* ------------------------------------------------------------ the week */

/* Sunday 14 September: the last closed week is Fri 4 – Thu 10, closing at
   Friday 11 September 00:00 in New York (04:00 UTC in summer time). */
let week = lastCompletedWeek(Date.parse("2026-09-14T18:00:00Z"));
assert.deepStrictEqual(week, {
  start: "2026-09-04T04:00:00.000Z",
  end: "2026-09-11T04:00:00.000Z",
  firstDay: "2026-09-04",
  lastDay: "2026-09-10",
});
/* A minute before and after the close, in New York time. */
assert.strictEqual(lastCompletedWeek(Date.parse("2026-09-18T03:59:00Z")).end, "2026-09-11T04:00:00.000Z");
assert.strictEqual(lastCompletedWeek(Date.parse("2026-09-18T04:01:00Z")).end, "2026-09-18T04:00:00.000Z");
/* Clocks go back on 1 November: midnight is 05:00 UTC afterwards. */
week = lastCompletedWeek(Date.parse("2026-11-07T12:00:00Z"));
assert.strictEqual(week.start, "2026-10-30T04:00:00.000Z");
assert.strictEqual(week.end, "2026-11-06T05:00:00.000Z");
assert.strictEqual(nextWeekClose(Date.parse("2026-09-14T18:00:00Z")), "2026-09-18T04:00:00.000Z");

/* ------------------------------------------------------------- the data */

const at = (iso) => iso;
const visitor = (session, pathName, when) =>
  db.prepare("INSERT INTO page_views(session_id,day,path,market,source,campaign,viewed_at) VALUES(?,?,?,?,?,?,?)")
    .run(session, when.slice(0, 10), pathName, "us", "direct", "", when);

/* Visitors started being counted on 1 September. */
visitor("session_before_week_0001", "/us", at("2026-09-01T12:00:00Z"));
/* Inside the week of 4–10 September. */
visitor("session_week_visitor_01", "/us", at("2026-09-05T12:00:00Z"));
visitor("session_week_visitor_01", "/us/live", at("2026-09-05T12:05:00Z"));
visitor("session_week_visitor_02", "/us", at("2026-09-08T12:00:00Z"));

/* The owner's own browser is refused at the door... */
assert.strictEqual(
  pageViewRow({ session_id: "internal_0123456789abcdef", path: "/us" }, { userAgent: "Mozilla/5.0 Safari", markets: ["us"] }),
  null,
  "the owner's own visit was recorded",
);
/* ...and skipped by every count even if one got in. */
visitor("internal_session_owner_01", "/us/live", at("2026-09-06T12:00:00Z"));

const click = (session, when) =>
  db.prepare("INSERT INTO clicks(product_id,clicked_at,destination_type,action_type,session_id) VALUES(?,?,?,?,?)")
    .run(null, when, "retailer", "view_deal", session);
try {
  click("session_week_visitor_01", "2026-09-05T12:10:00Z");
  click("internal_session_owner_01", "2026-09-06T12:10:00Z");
  click("", "2026-09-06T12:11:00Z");
} catch (error) {
  /* The clicks table requires more columns in some schema versions; fill them. */
  throw new Error(`clicks fixture does not match the schema: ${error.message}`);
}

const subscriber = (email, created, status = "active", unsubscribedAt = null) =>
  db.prepare("INSERT INTO subscribers(email,categories,status,source,market,created_at,updated_at,unsubscribed_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(email, "[]", status, "homepage", "us", created, unsubscribedAt || created, unsubscribedAt);
subscriber("early@example.com", "2026-08-01T00:00:00Z");
subscriber("joined@example.com", "2026-09-07T00:00:00Z");
subscriber("left@example.com", "2026-08-02T00:00:00Z", "unsubscribed", "2026-09-09T00:00:00Z");
subscriber("later@example.com", "2026-09-12T00:00:00Z");

db.prepare("INSERT INTO live_drops(drop_key,market,title,start_at,end_at,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
  .run("drop_week", "us", "Test drop", "2026-09-10T00:00:00Z", "2026-09-10T00:10:00Z", 1, "2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z");
const event = db.prepare("INSERT INTO live_drop_events(drop_id,market,event_type,session_id,occurred_at) VALUES(?,?,?,?,?)");
event.run(1, "us", "reveal", "session_week_visitor_01", "2026-09-10T00:01:00Z");
event.run(1, "us", "buy_click", "session_week_visitor_01", "2026-09-10T00:02:00Z");
event.run(1, "us", "reveal", "internal_session_owner_01", "2026-09-10T00:01:00Z");

const metrics = periodMetrics(db, "2026-09-04T04:00:00.000Z", "2026-09-11T04:00:00.000Z");
assert.strictEqual(metrics.visitorsCounted, true);
assert.strictEqual(metrics.visitors, 2, "the owner's own browser counted as a visitor");
assert.strictEqual(metrics.liveVisitors, 1);
assert.strictEqual(metrics.peopleToShop, 1, "the owner's own click counted as a person");
assert.strictEqual(metrics.subscribers, 2, "subscribed at the end of the week: early and joined, not left or later");
assert.strictEqual(metrics.subscribersJoined, 1);
assert.strictEqual(metrics.subscribersLeft, 1);
assert.strictEqual(metrics.dropPagePeople, 1, "the owner's own drop visit counted");
assert.strictEqual(metrics.dropPressedBuy, 1);

/* Before counting started, visitors are unknown, not zero. */
assert.strictEqual(periodMetrics(db, "2026-08-01T00:00:00Z", "2026-08-08T00:00:00Z").visitorsCounted, false);

/* ------------------------------------------------------- the snapshot */

const now = Date.parse("2026-09-14T18:00:00Z");
assert.strictEqual(ensureWeeklySnapshot(db, now), true, "the closed week was not saved");
assert.strictEqual(ensureWeeklySnapshot(db, now + 3600000), false, "the same week was saved twice");
let weeks = listWeeklySnapshots(db);
assert.strictEqual(weeks.length, 1);
assert.strictEqual(weeks[0].firstDay, "2026-09-04");
assert.strictEqual(weeks[0].lastDay, "2026-09-10");
assert.strictEqual(weeks[0].metrics.visitors, 2);

/* Frozen: a late row for that week does not change what was saved. */
visitor("session_late_arrival_01", "/us", at("2026-09-09T12:00:00Z"));
ensureWeeklySnapshot(db, now + 7200000);
assert.strictEqual(listWeeklySnapshots(db)[0].metrics.visitors, 2, "a saved week changed after it was saved");

/* The next week closes and is added above it. */
assert.strictEqual(ensureWeeklySnapshot(db, Date.parse("2026-09-18T05:00:00Z")), true);
weeks = listWeeklySnapshots(db);
assert.deepStrictEqual(weeks.map((row) => row.firstDay), ["2026-09-11", "2026-09-04"], "newest first");

/* --------------------------------------- this window against the last */

const numbers = overview(db, { days: 7, now: Date.parse("2026-09-11T04:00:00Z") });
assert.strictEqual(numbers.compare.current.visitors, 3, "late arrival included in a live window");
assert.strictEqual(numbers.compare.previous.visitors, 1);
assert.strictEqual(numbers.engagedSessions, 1, "the owner's click counted in People who went to a shop");

console.log("Growth comparison and weekly snapshots passed.");
