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

const port = 18089;
process.env.PORT = String(port);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-analytics-"));
process.env.SUPPORTED_MARKETS = "us";
process.env.WEBSITE_SITE_NAME = "onedailydrop-analytics-test";
process.env.EBAY_CLIENT_ID = "test-client-id";
process.env.EBAY_CLIENT_SECRET = "test-client-secret";
process.env.EBAY_CAMPAIGN_ID = "5339179772";
process.env.ADMIN_KEY = "test-admin-key";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const db = require("../src/db");
const now = new Date().toISOString();
const product = db.prepare(`
  INSERT INTO products(
    external_id,provider_external_id,market,title,category,image_url,affiliate_url,retailer_name,
    availability,checked_at,current_price,currency,source,status,updated_at,first_seen_at,last_seen_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id
`).get(
  "us:ebay:analytics-test-1",
  "ebay:analytics-test-1",
  "us",
  "Analytics Test Product",
  "electronics",
  "https://i.ebayimg.com/images/g/test/s-l1600.jpg",
  "https://www.ebay.com/itm/123456789?campid=5339179772",
  "eBay",
  "In stock",
  now,
  49.99,
  "USD",
  "ebay",
  "published",
  now,
  now,
  now
);

require("../src/server");
const base = `http://127.0.0.1:${port}`;

async function ready() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${base}/api/status`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Analytics test server did not start");
}

async function run() {
  await ready();
  const events = {
    market:"us",
    events:[
      {
        eventId:"analytics-search-001",
        sessionId:"analytics-session-001",
        eventType:"search",
        sourcePage:"search",
        query:"test product",
        resultCount:1
      },
      {
        eventId:"analytics-impression-1",
        sessionId:"analytics-session-001",
        eventType:"impression",
        sourcePage:"search",
        placement:"catalog_title",
        productId:Number(product.id),
        position:1
      }
    ]
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${base}/api/analytics/events`, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify(events)
    });
    assert(response.status === 204, "Search/impression analytics request failed");
  }
  assert(Number(db.prepare("SELECT COUNT(*) AS total FROM analytics_events").get().total) === 2, "Analytics retries created duplicate events");

  const productClick = await fetch(`${base}/api/click-events`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      eventId:"analytics-product-click",
      sessionId:"analytics-session-001",
      productId:Number(product.id),
      sourcePage:"search",
      placement:"catalog_title",
      action:"view_details"
    })
  });
  assert(productClick.status === 204, "Product click analytics request failed");

  const outbound = await fetch(`${base}/us/go/${product.id}?source=product&placement=product_cta&action=view_deal&sid=analytics-session-001&eid=analytics-outbound-001`, {redirect:"manual"});
  assert(outbound.status === 302, "Outbound analytics redirect failed");

  const reportResponse = await fetch(`${base}/api/admin/analytics-baseline?days=7`, {
    headers:{"x-admin-key":"test-admin-key"}
  });
  const report = await reportResponse.json();
  assert(reportResponse.status === 200, "Analytics baseline report is unavailable");
  assert(Number(report.totals.searches) === 1, "Search total is incorrect");
  assert(Number(report.totals.impressions) === 1, "Impression total is incorrect");
  assert(Number(report.totals.product_clicks) === 1, "Product click total is incorrect");
  assert(Number(report.totals.outbound_clicks) === 1, "Outbound click total is incorrect");
  assert(Number(report.rates.searches_per_session) === 1, "Searches per session is incorrect");
  assert(Number(report.rates.result_ctr) === 1, "Result CTR is incorrect");
  assert(Number(report.rates.outbound_ctr) === 1, "Outbound CTR is incorrect");
  assert(report.queries[0]?.query_text === "test product", "Search query breakdown is missing");
  assert(report.merchants[0]?.retailer_name === "eBay", "Merchant outbound breakdown is missing");

  const rankingResponse = await fetch(`${base}/api/admin/ranking-validation`, {
    headers:{"x-admin-key":"test-admin-key"}
  });
  const ranking = await rankingResponse.json();
  assert(rankingResponse.status === 200, "Day 7 ranking validation report is unavailable");
  assert(ranking.model === "ranking-validation-v1", "Day 7 ranking validation model is incorrect");
  assert(ranking.markets.some(market => market.market === "us" && market.products === 1), "US ranking slice is missing");
  console.log("Day 5 analytics baseline test passed");
}

run().then(() => process.exit(0)).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
