/*
 * The email that says a price watch was actually saved.
 *
 * It was missing, and its absence did not look like a missing email — it
 * looked like a broken form. The watch was stored correctly and in total
 * silence, so the first person to use the feature concluded it had failed,
 * which was a reasonable conclusion from everything they could see.
 *
 * The route is driven over real HTTP rather than by calling the handler,
 * because what is being checked is the whole path a person takes: post the
 * form, get an answer that says an email is coming, and have the email
 * actually go out with the right price in it.
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

const sent = [];

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

/*
 * The mailer posts to SendGrid with fetch rather than through a client
 * library, so that is where the transport is intercepted. Only SendGrid is
 * caught — the test's own requests to the local server go through untouched,
 * and a real send is never attempted with a fake key.
 */
const realFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).includes("api.sendgrid.com")) {
    sent.push(JSON.parse(options.body));
    return new Response("", { status: 202 });
  }
  return realFetch(url, options);
};

const port = 18122;
process.env.PORT = String(port);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-watch-"));
process.env.SUPPORTED_MARKETS = "us";
process.env.SENDGRID_API_KEY = "SG.test-key";
process.env.EMAIL_FROM = "info@onedailydrop.com";

const db = require("../src/db");

db.prepare(`INSERT INTO products(id,external_id,market,title,current_price,currency,status,affiliate_url,retailer_name,source,updated_at,first_seen_at,last_seen_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  4242, "watch-1", "us", "Tribesigns Standing Desk", 249.99, "USD", "published",
  "https://www.awin1.com/pclick.php?p=1&a=2&m=3", "Tribesigns", "feed-tribesigns-us",
  "2026-09-08T00:00:00.000Z", "2026-09-08T00:00:00.000Z", "2026-09-08T00:00:00.000Z",
);

require("../src/server");

const post = async (body) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/price-watches`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

(async () => {
  /* Let the server bind. */
  await new Promise(resolve => setTimeout(resolve, 2500));

  const ok = await post({ email: "shopper@example.com", product_id: 4242 });
  assert.strictEqual(ok.status, 201, "the watch is accepted");
  /* The answer on screen has to promise the email, or the person still does
     not know whether anything happened until they go and look. */
  assert.match(ok.body.message, /email/i, "the reply mentions the email");

  /* The send is fire-and-forget, so it lands a tick later. */
  await new Promise(resolve => setTimeout(resolve, 500));

  assert.strictEqual(sent.length, 1, "exactly one email, to the person who asked");
  const email = sent[0];
  assert.strictEqual(email.personalizations[0].to[0].email, "shopper@example.com");
  assert.match(email.subject, /Tribesigns Standing Desk/, "the subject names the product");
  const html = String(email.content[0].value);
  assert.match(html, /Tribesigns Standing Desk/);
  /* The price it will measure against, written down where the person can see
     it — otherwise "we will tell you if it gets cheaper" is not a promise
     anybody can hold us to. */
  assert.match(html, /249\.99/, "the email states today's price");
  assert.match(html, /USD/);
  /* The deal path is a slug ending in the id, which is what the site's own
     links look like — matching a bare /deal/4242 would assert a URL the site
     does not use. */
  assert.match(html, /\/us\/deal\/[a-z0-9-]*4242\b/, "and links back to the listing");

  /* Saved either way: an email that fails to send must not lose the watch. */
  const stored = db.prepare("SELECT email, price_when_asked FROM price_watches WHERE product_id=?").get(4242);
  assert.strictEqual(stored.email, "shopper@example.com");
  assert.strictEqual(Number(stored.price_when_asked), 249.99);

  /* Asking again re-arms the watch; it should confirm again rather than go
     quiet, because from the outside a silent second attempt looks like the
     first one having failed. */
  const again = await post({ email: "shopper@example.com", product_id: 4242 });
  assert.strictEqual(again.status, 201);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.strictEqual(sent.length, 2, "a repeat ask confirms again");

  /* Nothing is sent when there is nothing to watch. */
  const missing = await post({ email: "shopper@example.com", product_id: 999999 });
  assert.strictEqual(missing.status, 404);
  const bad = await post({ email: "not-an-address", product_id: 4242 });
  assert.strictEqual(bad.status, 400);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.strictEqual(sent.length, 2, "no email for a rejected request");

  console.log("price watch confirmation: ok");
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
