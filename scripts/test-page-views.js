/*
 * Visitors, and where they came from.
 *
 * Built on the real schema from src/db.js, the way test-overview.js is, so a
 * query naming a column that does not exist fails here rather than printing a
 * zero in the admin panel — a zero looks like an answer.
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

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-page-views-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { overview } = require("../src/overview");
const { looksLikeBot, pageKind, pageViewRow, recordPageView, visitSource } = require("../src/pageViews");

const browser = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const session = (name) => `session_${name}_0123456789abcdef`;

/* ------------------------------------------------------------- sources */

assert.strictEqual(visitSource({ referrer: "https://www.google.com/" }), "google");
assert.strictEqual(visitSource({ referrer: "https://www.google.co.uk/search?q=deals" }), "google");
assert.strictEqual(visitSource({ referrer: "https://l.instagram.com/?u=x" }), "instagram");
assert.strictEqual(visitSource({ referrer: "https://www.tiktok.com/@onedailydrop" }), "tiktok");
assert.strictEqual(visitSource({ referrer: "https://t.co/abc" }), "x");
assert.strictEqual(visitSource({ referrer: "https://m.youtube.com/watch?v=1" }), "youtube");
assert.strictEqual(visitSource({ referrer: "https://some-blog.example/post" }), "some-blog.example");
/* The label we wrote on the link beats whatever the app did to the referrer. */
assert.strictEqual(visitSource({ utmSource: "TikTok Bio", referrer: "https://www.google.com/" }), "tiktok_bio");
/* Our own pages and no referrer are direct, not a source. */
assert.strictEqual(visitSource({ referrer: "https://www.onedailydrop.com/us" }), "direct");
assert.strictEqual(visitSource({ referrer: "http://localhost:8092/us", ownHost: "localhost:8092" }), "direct");
assert.strictEqual(visitSource({ referrer: "" }), "direct");
assert.strictEqual(visitSource({ referrer: "not a url" }), "direct");

/* ---------------------------------------------------------------- bots */

for (const agent of [
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
  "facebookexternalhit/1.1",
  "curl/8.4.0",
  "",
]) {
  assert.strictEqual(looksLikeBot(agent), true, `counted as a person: ${agent}`);
}
assert.strictEqual(looksLikeBot(browser), false);

/* ---------------------------------------------------------------- rows */

const now = new Date("2026-09-14T18:00:00.000Z");
assert.strictEqual(pageViewRow({ session_id: session("a"), path: "/us" }, { userAgent: "Googlebot" }), null);
assert.strictEqual(pageViewRow({ session_id: "short", path: "/us" }, { userAgent: browser }), null, "a malformed session was kept");
assert.strictEqual(pageViewRow({ session_id: session("a"), path: "https://evil.example/" }, { userAgent: browser }), null);
assert.strictEqual(pageViewRow({ session_id: session("a"), path: "//evil.example/" }, { userAgent: browser }), null);
const row = pageViewRow(
  { session_id: session("a"), path: "/us/live?email=someone@example.com", utm_source: "tiktok", utm_campaign: "Drop #2 teaser" },
  { userAgent: browser, markets: ["us"], now },
);
assert.strictEqual(row.path, "/us/live", "the query string, which can hold anything, was kept");
assert.strictEqual(row.source, "tiktok");
assert.strictEqual(row.campaign, "drop_2_teaser");
assert.strictEqual(row.day, "2026-09-14");

assert.strictEqual(pageKind("/us"), "Home");
assert.strictEqual(pageKind("/us/live"), "Live Drop");
assert.strictEqual(pageKind("/us/deal/218985-some-tv"), "Product pages");
assert.strictEqual(pageKind("/us/stores"), "Stores");

/* ------------------------------------------------ counting and the panel */

const view = (name, pagePath, extra = {}, at = now) =>
  recordPageView(db, pageViewRow({ session_id: session(name), path: pagePath, ...extra }, { userAgent: browser, markets: ["us"], now: at }));

/* Arrived from TikTok on the Live page, then looked around. */
assert.strictEqual(view("tiktok", "/us/live", { utm_source: "tiktok" }, new Date("2026-09-14T17:00:00Z")), true);
view("tiktok", "/us", { referrer: "https://www.onedailydrop.com/us/live" }, new Date("2026-09-14T17:05:00Z"));
view("tiktok", "/us/deal/1-thing", { referrer: "https://www.onedailydrop.com/us" }, new Date("2026-09-14T17:06:00Z"));
/* The same page again that day is not another row. */
assert.strictEqual(view("tiktok", "/us/live", { utm_source: "tiktok" }, new Date("2026-09-14T17:30:00Z")), false, "a reload counted twice");
/* From Google to a product. */
view("google", "/us/deal/2-other", { referrer: "https://www.google.com/" });
/* Typed the address. */
view("direct", "/us");
/* A crawler, which must never appear. */
recordPageView(db, pageViewRow({ session_id: session("bot"), path: "/us" }, { userAgent: "Googlebot/2.1", now }));
/* Long before the window. */
view("old", "/us", {}, new Date("2026-06-01T12:00:00Z"));

const numbers = overview(db, { days: 7, now: now.getTime() }).visits;
assert.strictEqual(numbers.visitors, 3, `visitors: ${JSON.stringify(numbers)}`);
assert.strictEqual(numbers.pageViews, 5);
assert.strictEqual(numbers.liveVisitors, 1);
const bySource = Object.fromEntries(numbers.sources.map((item) => [item.source, item]));
assert.strictEqual(bySource.tiktok?.visitors, 1, "the TikTok visitor was split across the pages they went on to");
assert.strictEqual(bySource.tiktok.liveVisitors, 1);
assert.strictEqual(bySource.google?.visitors, 1);
assert.strictEqual(bySource.direct?.visitors, 1, "a later internal page turned the TikTok visitor into a direct one");
assert.deepStrictEqual(numbers.campaigns, []);
const byPage = Object.fromEntries(numbers.pages.map((item) => [item.page, item.visitors]));
assert.strictEqual(byPage["Product pages"], 2);
assert.strictEqual(byPage.Home, 2);
assert.strictEqual(byPage["Live Drop"], 1);
assert.strictEqual(numbers.countingSince, "2026-06-01T12:00:00.000Z");

/* ------------------------------------------- which channel sends shoppers */

/*
 * Visitors per source said a post had been seen. It could not say whether
 * anybody who arrived was shopping, and that is the number the whole content
 * plan turns on: a channel can send five hundred people who never open a
 * listing, and over four weeks that reads as success until the earnings are
 * checked. The clicks were already stored with the session on them; nothing
 * joined them to where the visit came from.
 */
const click = (name, { at = now, destination = "retailer" } = {}) =>
  db
    .prepare(
      `INSERT INTO clicks(event_id,session_id,product_id,market,retailer_name,source_page,
         placement,action_type,destination_type,clicked_at,referrer,user_agent)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      `event_${name}_${at.getTime()}_${destination}`,
      session(name),
      1,
      "us",
      "eBay",
      "product",
      "product_cta",
      "view_deal",
      destination,
      at.toISOString(),
      "",
      browser,
    );

/* Two clicks from the one TikTok visitor: one interested shopper, not two. */
click("tiktok", { at: new Date("2026-09-14T17:10:00Z") });
click("tiktok", { at: new Date("2026-09-14T17:12:00Z") });
/* The Google visitor browsed internally and never left for a shop. */
click("google", { destination: "internal" });
/* And one from before the window, which belongs to no report shown here. */
click("direct", { at: new Date("2026-06-02T12:00:00Z") });

const withClicks = Object.fromEntries(
  overview(db, { days: 7, now: now.getTime() }).visits.sources.map((item) => [item.source, item]),
);
assert.strictEqual(
  withClicks.tiktok.clickedVisitors,
  1,
  "two clicks from one visitor were counted as two interested shoppers",
);
assert.strictEqual(
  withClicks.google.clickedVisitors,
  0,
  "a click that stayed on the site was counted as a visit to a shop",
);
assert.strictEqual(
  withClicks.direct.clickedVisitors,
  0,
  "a click from outside the window was counted inside it",
);
/* The counts it sits beside must not have moved. */
assert.strictEqual(withClicks.tiktok.visitors, 1, "joining the clicks multiplied the visitors");
assert.strictEqual(withClicks.tiktok.liveVisitors, 1);

console.log("Page views and visitor sources passed.");
