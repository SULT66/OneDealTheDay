/**
 * The link checker must archive listings that are genuinely gone and must not
 * touch anything else.
 *
 * The failure mode worth guarding against is not "a dead link survives" — it is
 * "a retailer has a bad night and the catalog empties itself". Every assertion
 * below is about that asymmetry.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odd-linkhealth-"));
process.env.DATA_DIR = dir;
process.env.EBAY_CLIENT_ID = "test";
process.env.EBAY_CLIENT_SECRET = "test";
process.env.EBAY_CAMPAIGN_ID = "1234567890";

const db = require("../src/db");
const { checkProducts, classify, FAILURES_BEFORE_ARCHIVE } = require("../src/linkHealth");

/* ------------------------------------------------------------- classify */

assert.strictEqual(classify(200), "ok");
assert.strictEqual(classify(301), "ok");
assert.strictEqual(classify(404), "gone", "a 404 means the listing is gone");
assert.strictEqual(classify(410), "gone");
assert.strictEqual(
  classify(503),
  "soft",
  "a retailer outage must never be read as a dead listing",
);
assert.strictEqual(classify(429), "soft", "rate limiting is not a dead listing");
assert.strictEqual(
  classify(403),
  "soft",
  "a bot wall is far more often a bot wall than a removed product",
);

/* --------------------------------------------------------------- fixtures */

const insert = db.prepare(`
  INSERT INTO products(id,external_id,title,image_url,affiliate_url,current_price,currency,source,status,market,updated_at,availability)
  VALUES(?,?,?,?,?,?,?,?,'published',?,?, 'In stock')
`);
const now = new Date().toISOString();
const rows = [
  [1, "live", "https://retailer.test/live"],
  [2, "dead", "https://retailer.test/dead"],
  [3, "flaky", "https://retailer.test/flaky"],
  [4, "walled", "https://retailer.test/walled"],
];
for (const [id, name, url] of rows) {
  insert.run(id, `ext-${id}`, `Product ${name}`, "https://img.test/x.jpg", url, 20, "USD", "ebay", "us", now);
}

const statuses = {
  "https://retailer.test/live": 200,
  "https://retailer.test/dead": 404,
  "https://retailer.test/flaky": 503,
  "https://retailer.test/walled": 403,
};
let calls = 0;
const fetchImpl = async url => {
  calls += 1;
  return { status: statuses[String(url)] ?? 200 };
};

const products = db.prepare("SELECT id,affiliate_url,market,title FROM products ORDER BY id").all();
const statusOf = id => db.prepare("SELECT status FROM products WHERE id=?").get(id).status;

/* ------------------------------------------------------- one bad night */

(async () => {
  const first = await checkProducts(products, { fetchImpl, concurrency: 2 });
  assert.strictEqual(first.checked, 4);
  assert.strictEqual(first.ok, 1);
  assert.strictEqual(first.archived, 1, "only the 404 is archived on the first run");

  assert.strictEqual(statusOf(1), "published", "a working link must be left alone");
  assert.strictEqual(statusOf(2), "archived", "a 404 listing must leave the catalog");
  assert.strictEqual(
    statusOf(3),
    "published",
    "a single 503 must not archive anything — one flaky night would otherwise " +
    "empty the catalog, which is far worse than a stale link",
  );
  assert.strictEqual(statusOf(4), "published", "a single 403 must not archive anything");

  /* ------------------------------------------- a link that stays broken */

  const flaky = db.prepare("SELECT id,affiliate_url,market,title FROM products WHERE id=3").all();
  for (let run = 2; run <= FAILURES_BEFORE_ARCHIVE; run += 1) {
    await checkProducts(flaky, { fetchImpl, concurrency: 2 });
  }
  assert.strictEqual(
    statusOf(3),
    "archived",
    `a link failing ${FAILURES_BEFORE_ARCHIVE} runs in a row is not a bad night any more`,
  );

  /* ------------------------------------- recovery resets the counter
   *
   * Product 4 is one strike short of removal when its 403 clears. That is the
   * case that matters: a retailer that blocks the checker for two nights and
   * then stops must not leave the listing permanently one bad night from being
   * archived. */
  await checkProducts(
    db.prepare("SELECT id,affiliate_url,market,title FROM products WHERE id=4").all(),
    { fetchImpl },
  );
  assert.strictEqual(
    db.prepare("SELECT consecutive_failures FROM link_health WHERE product_id=4").get().consecutive_failures,
    2,
    "two failures short of the threshold must not archive",
  );
  assert.strictEqual(statusOf(4), "published");

  statuses["https://retailer.test/walled"] = 200;
  await checkProducts(
    db.prepare("SELECT id,affiliate_url,market,title FROM products WHERE id=4").all(),
    { fetchImpl },
  );
  const health = db.prepare("SELECT consecutive_failures FROM link_health WHERE product_id=4").get();
  assert.strictEqual(
    health.consecutive_failures,
    0,
    "a link that comes back must reset its failure count, not stay one strike from removal",
  );
  assert.strictEqual(statusOf(4), "published");

  assert(calls > 0, "the checker must actually make requests");
  console.log("Link health guards passed: dead links archived, outages tolerated.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
