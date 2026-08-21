const db = require("./db");
const { sourceSql } = require("./publicCatalog");

/**
 * Daily check that every published product still has a retailer link that
 * actually resolves.
 *
 * The methodology page promises a "working commissionable retailer link" as a
 * publication condition. Until now nothing re-checked that after ingestion, so
 * the promise was only true on the day a product was imported. A dead outbound
 * link is the worst failure this site has: the visitor has already decided to
 * buy, we have already been paid nothing, and an affiliate reviewer reading the
 * methodology sees the site contradicting its own published rule.
 *
 * A product whose link no longer resolves is archived rather than deleted:
 * archived products stay out of every list, out of /deal/ and out of /go/,
 * and the row is kept so the price history behind it survives.
 *
 * Deliberately conservative about what counts as broken:
 *   - only 404 and 410 archive on the first failure. Those mean "this listing
 *     is gone", and retailers return them reliably.
 *   - 429 and 5xx are the retailer having a bad minute, never the listing being
 *     dead. They are recorded and retried, never acted on.
 *   - a timeout or a refused connection is treated the same way.
 * A link has to fail on FAILURES_BEFORE_ARCHIVE separate runs before anything
 * is archived on a soft error, so one flaky night cannot empty the catalog.
 */
const FAILURES_BEFORE_ARCHIVE = 3;
const REQUEST_TIMEOUT_MS = 12000;
const DEFAULT_CONCURRENCY = 6;

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_health(
      product_id INTEGER PRIMARY KEY,
      last_checked_at TEXT NOT NULL,
      last_status INTEGER,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);
}

/**
 * HEAD first, because it is a fraction of the bytes and every retailer supports
 * it — but a good number answer 405 to it, so fall back to a ranged GET rather
 * than reading a whole product page.
 */
async function probe(url, fetchImpl, signal) {
  for (const [method, headers] of [["HEAD", {}], ["GET", { Range: "bytes=0-0" }]]) {
    const response = await fetchImpl(url, {
      method,
      redirect: "follow",
      signal,
      headers: { "User-Agent": "OneDailyDrop-LinkCheck/1.0", ...headers },
    });
    if (response.status !== 405 && response.status !== 501) return response.status;
  }
  return 405;
}

function classify(status) {
  if (status === 404 || status === 410) return "gone";
  if (status >= 200 && status < 400) return "ok";
  /* 401/403 is very often a bot wall rather than a dead listing, so it is a
     soft failure that needs to repeat before anything happens. */
  return "soft";
}

async function checkProducts(products, { fetchImpl = global.fetch, concurrency = DEFAULT_CONCURRENCY } = {}) {
  ensureTable();
  const now = new Date().toISOString();
  const readHealth = db.prepare("SELECT * FROM link_health WHERE product_id=?");
  const writeHealth = db.prepare(`
    INSERT INTO link_health(product_id,last_checked_at,last_status,consecutive_failures,last_error)
    VALUES(?,?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET
      last_checked_at=excluded.last_checked_at,
      last_status=excluded.last_status,
      consecutive_failures=excluded.consecutive_failures,
      last_error=excluded.last_error
  `);
  const archive = db.prepare("UPDATE products SET status='archived',updated_at=? WHERE id=?");

  const summary = { checked: 0, ok: 0, archived: 0, soft: 0, archivedIds: [] };
  const queue = [...products];

  const worker = async () => {
    while (queue.length) {
      const product = queue.shift();
      const url = String(product.affiliate_url || "").trim();
      summary.checked += 1;
      let status = 0;
      let error = "";
      if (!/^https?:\/\//i.test(url)) {
        error = "no http link";
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
          status = await probe(url, fetchImpl, controller.signal);
        } catch (cause) {
          error = String(cause?.message || cause).slice(0, 200);
        } finally {
          clearTimeout(timer);
        }
      }

      const verdict = error ? "soft" : classify(status);
      const previous = readHealth.get(product.id);
      const failures = verdict === "ok" ? 0 : Number(previous?.consecutive_failures || 0) + 1;
      writeHealth.run(product.id, now, status || null, failures, error || null);

      if (verdict === "ok") {
        summary.ok += 1;
      } else if (verdict === "gone" || failures >= FAILURES_BEFORE_ARCHIVE) {
        archive.run(now, product.id);
        summary.archived += 1;
        summary.archivedIds.push(product.id);
      } else {
        summary.soft += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  return summary;
}

/**
 * @param {object} [options]
 * @param {number} [options.limit] cap the run; the oldest checks go first, so
 *   a capped run still works through the whole catalog over a few days.
 */
async function runLinkHealthCheck(options = {}) {
  ensureTable();
  const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, Number(options.limit)) : 400;
  const products = db.prepare(`
    SELECT p.id, p.affiliate_url, p.market, p.title
    FROM products p
    LEFT JOIN link_health h ON h.product_id = p.id
    WHERE p.status='published' AND ${sourceSql("p")}
    ORDER BY COALESCE(h.last_checked_at, '') ASC, p.id ASC
    LIMIT ?
  `).all(limit);

  const summary = await checkProducts(products, options);
  console.log(
    `[link-health] checked ${summary.checked}, ok ${summary.ok}, ` +
    `retrying ${summary.soft}, archived ${summary.archived}` +
    (summary.archived ? ` (${summary.archivedIds.slice(0, 10).join(", ")})` : ""),
  );
  return summary;
}

module.exports = { runLinkHealthCheck, checkProducts, classify, FAILURES_BEFORE_ARCHIVE };
