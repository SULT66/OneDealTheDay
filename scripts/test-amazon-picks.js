/*
 * Amazon picks: added by hand, and never touched by us afterwards.
 *
 * Two properties matter here and both have burned this codebase before.
 *
 * The first is that the link is stored and served back byte for byte. It
 * carries the associate tag, and a link that has lost it looks exactly like
 * one that works while earning nothing — which is precisely what the "shop
 * all" links did for months before anyone noticed.
 *
 * The second is that nothing anywhere asks Amazon for anything. Their
 * agreement allows their price, availability and images to be shown only when
 * they come from the Product Advertising API, and that opens after three
 * qualifying sales. A helpful future change that fetches a title or a price to
 * fill the page out would put the account at risk, so the absence is asserted
 * rather than left as a convention.
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

/* Every host anything in this process reaches for, so a fetch to Amazon cannot
   hide inside a passing test. */
const reached = [];
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  reached.push(String(url));
  return realFetch(url, options);
};

const port = 18131;
const KEY = "test-admin-key";
process.env.PORT = String(port);
process.env.ADMIN_KEY = KEY;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-amazon-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
require("../src/server");

const base = `http://127.0.0.1:${port}`;
const admin = { "Content-Type": "application/json", "X-Admin-Key": KEY };

const post = async (body) => {
  const response = await realFetch(`${base}/api/admin/amazon-picks`, {
    method: "POST", headers: admin, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

/* The real short link from a SiteStripe session, tag and all. */
const LINK = "https://amzn.to/4xQn882";

(async () => {
  await new Promise(resolve => setTimeout(resolve, 2500));

  /* --- Only Amazon links, and only with a name. --- */
  assert.strictEqual((await post({ title: "A thing", url: "https://example.com/thing" })).status, 400, "not an Amazon link");
  assert.strictEqual((await post({ title: "A thing", url: "http://amzn.to/4xQn882" })).status, 400, "http is not https");
  assert.strictEqual((await post({ title: "", url: LINK })).status, 400, "a name is required — nothing is fetched to supply one");

  const added = await post({ title: "Anker 20W charger", category: "Electronics", url: LINK });
  assert.strictEqual(added.status, 201);

  /* A full listing URL carries the ASIN; a short link does not, and that is
     not a failure — it is recorded when it is there and left blank when not. */
  const full = await post({ title: "Full link", url: "https://www.amazon.com/dp/B0DR9PMK1W?tag=onedailydrop-20" });
  assert.strictEqual(full.status, 201);
  assert.strictEqual(full.body.asin, "B0DR9PMK1W");

  assert.strictEqual((await post({ title: "Same again", url: LINK })).status, 409, "the same link twice is one product");

  /* --- The admin key is the gate. --- */
  const open = await realFetch(`${base}/api/admin/amazon-picks`);
  assert.strictEqual(open.status, 401);

  /* --- What the public sees: a name, and nothing that could go stale. --- */
  const publicList = await (await realFetch(`${base}/api/amazon-picks?market=us`)).json();
  assert.strictEqual(publicList.length, 2);
  assert.deepStrictEqual(Object.keys(publicList[0]).sort(), ["category", "id", "title"]);
  /* No price and no image field even exists to be filled in later by accident:
     both are Amazon's to publish, not ours to copy. */
  for (const key of ["price", "image", "image_url", "url"]) {
    assert.ok(!(key in publicList[0]), `the public shape must not carry ${key}`);
  }

  /* --- The link goes out exactly as it came in. --- */
  const id = added.body.id;
  const redirect = await realFetch(`${base}/us/amazon/go/${id}?sid=test-session-abcdef123456`, { redirect: "manual" });
  assert.strictEqual(redirect.status, 302);
  assert.strictEqual(
    redirect.headers.get("location"),
    LINK,
    "byte for byte: an added parameter is how an affiliate tag stops being honoured",
  );

  /* And the click is a person, not an anonymous total. */
  const click = db.prepare("SELECT session_id, retailer_name, destination_type FROM clicks ORDER BY id DESC LIMIT 1").get();
  assert.strictEqual(click.session_id, "test-session-abcdef123456");
  assert.strictEqual(click.retailer_name, "Amazon");
  assert.strictEqual(click.destination_type, "retailer");

  /* A pick that does not exist is a 404, not a redirect to nowhere. */
  assert.strictEqual((await realFetch(`${base}/us/amazon/go/999999`, { redirect: "manual" })).status, 404);

  /* --- Removing one. --- */
  const removed = await realFetch(`${base}/api/admin/amazon-picks/${id}`, { method: "DELETE", headers: admin });
  assert.strictEqual(removed.status, 200);
  assert.strictEqual((await (await realFetch(`${base}/api/amazon-picks?market=us`)).json()).length, 1);

  /*
   * The one that protects the account: through all of the above, nothing
   * contacted Amazon. Adding a pick, listing them, following one and deleting
   * one are all local operations, and any future change that starts fetching a
   * title or a price to make the page look richer fails here.
   */
  const amazonCalls = reached.filter(url => /amazon\.|amzn\.to/i.test(url));
  assert.deepStrictEqual(amazonCalls, [], `nothing may call Amazon: ${amazonCalls.join(", ")}`);

  console.log("amazon picks: ok");
  /* The server and the database are still open, and exiting on the same tick
     as the last request trips a libuv assertion on Windows — a crash after a
     passing test, which reads as a failing test. One turn of the loop is
     enough for the handles to finish closing. */
  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
