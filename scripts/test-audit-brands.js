const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const port = 29000 + process.pid % 10000;
const base = "http://127.0.0.1:" + port;
Object.assign(process.env, {
  PORT: String(port), BACKEND_API_URL: base,
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "odd-audit-brands-")),
  WEBSITE_SITE_NAME: "audit-brands-test", SUPPORTED_MARKETS: "us,ca",
  EBAY_CLIENT_ID: "fixture", EBAY_CLIENT_SECRET: "fixture", EBAY_CAMPAIGN_ID: "5339179772"
});
const config = require("../src/config");
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
let aborted = 0;
const assistant = require("../src/shoppingAssistant");
assistant.createShoppingAssistant = () => ({
  configured: true, model: "fixture",
  respond: ({signal,message}) => String(message).includes('fixture-pack') ? Promise.resolve({
    scope:'shopping',message:'Nothing matched exactly. Buy one pillow for less.',message_source:'delia',
    result_state:'closest_alternatives',recommendations:[{title:'Mainstays 1 Pillow',price_value:3.44,currency:'USD',retailer:'Walmart',url:'https://www.walmart.com/ip/pillow/1234',lowest_price:true,position_role:'lowest_price'}],comparison:[],comparison_notes:[]
  }) : new Promise((_resolve, reject) => signal.addEventListener("abort", () => {
    aborted++;
    reject(new Error("Fixture cancelled"));
  }, {once: true}))
});
const db = require("../src/db");
require("../app");
const now = new Date().toISOString();
function insert(id, brand, market = "us") {
  const p = {
    id, external_id: market + ":ebay:fixture-" + id, provider_external_id: "fixture-" + id,
    market, brand, brand_slug: brand.toLowerCase(),
    title: brand + " Model" + String.fromCharCode(65 + id % 26) + String.fromCharCode(65 + Math.floor(id / 26) % 26) + " Wireless Device",
    category: "Electronics", normalized_category: "Electronics", source: "ebay", retailer_name: "eBay",
    status: "published", availability: "In stock", current_price: id, currency: market === "ca" ? "CAD" : "USD",
    rating: id % 2 ? 4.8 : 0, review_count: id % 2 ? 100 : 0, score: 80, commerce_quality: 80, evidence_confidence: 80,
    image_url: "https://i.ebayimg.com/images/g/fixture-" + id + "/s-l1600.jpg",
    affiliate_url: "https://www.ebay.com/itm/" + (100000000000 + id) + "?campid=5339179772",
    seller_rating: 99.8, seller_feedback_count: 1000, shipping_summary: "Free shipping", return_summary: "30-day returns",
    checked_at: now, updated_at: now, first_seen_at: now, last_seen_at: now
  };
  db.prepare("INSERT INTO products(" + Object.keys(p) + ") VALUES(" + Object.keys(p).map(() => "?") + ")").run(...Object.values(p));
}
for (let i = 1; i <= 49; i++) insert(i, "Acme");
for (let i = 50; i < 80; i++) insert(i, "Brand" + String.fromCharCode(65 + Math.floor((i - 50) / 26)) + String.fromCharCode(65 + (i - 50) % 26));
insert(80, "Acme", "ca");

async function get(route) {
  const r = await fetch(base + route);
  assert.equal(r.status, 200, route);
  return r.text();
}
(async () => {
  for (let attempt = 0;; attempt++) {
    try {await get("/api/status"); break;} catch (error) {if (attempt > 100) throw error;}
    await new Promise(r => setTimeout(r, 100));
  }
  const directory = await get("/us/brands");
  assert.match(directory, /Search brands/);
  assert.doesNotMatch(directory, /id="mainNavigation"|shopping-assistant\.css|#top/);
  assert(directory.includes("31 brands"));
  assert((await get("/us/brands?q=Acme")).includes("1 brand"));
  const detail = await get("/us/brand/acme?sort=price-asc");
  assert.match(detail, /Model/);
  assert.doesNotMatch(detail, /id="mainNavigation"|shopping-assistant\.css|#top/);
  const links = html => [...html.matchAll(/href="\/us\/deal\/(\d+)[^"]*"/g)].map(m => m[1]);
  const first = new Set(links(detail));
  assert.equal(first.size, 24);
  const second = new Set(links(await get("/us/brand/acme?page=2&sort=price-asc")));
  assert.equal(second.size, 24);
  assert(![...second].some(id => first.has(id)));
  const last = new Set(links(await get("/us/brand/acme?page=3&sort=price-asc")));
  assert.equal(last.size, 1);
  assert(!first.has([...last][0]));
  const list = JSON.parse(await get("/api/brands?market=us"));
  const api = JSON.parse(await get("/api/brands/acme?market=us"));
  assert.equal(api.summary.products, 49);
  const acme = list.find(b => b.brand_slug === "acme");
  assert.equal(acme.product_count, 49);
  assert.equal(acme.avg_rating, api.summary.average_rating);
  assert.equal(JSON.parse(await get("/api/brands/acme?market=ca")).summary.products, 1);
  for (const route of ["/us/brand/not-a-real-brand", "/us/brand/unbranded"]) {
    assert.equal((await fetch(base + route)).status, 404);
  }
  for (const url of ["/brands?q=Acme", "/brand/acme?page=2", "/search?q=wireless"]) {
    const r = await fetch(base + url, {redirect: "manual"});
    assert([301, 308].includes(r.status));
    assert(r.headers.get("location").startsWith("/us/"));
    assert(r.headers.get("location").includes("?"));
  }
  const controller = new AbortController();
  const options = {
    method: "POST", headers: {"Content-Type": "application/json"},
    body: JSON.stringify({message: "Is this a good price?", product_id: 1, market: "us"})
  };
  const response = await fetch(base + "/api/shopping-assistant/stream", {...options, signal: controller.signal});
  const reader = response.body.getReader();
  const firstChunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(firstChunk, /"type":"preview"/);
  assert.match(firstChunk, /"catalog_product_id":1/);
  controller.abort();
  await reader.cancel().catch(() => {});
  for (let n = 0; n < 20 && !aborted; n++) await new Promise(r => setTimeout(r, 20));
  assert.equal(aborted, 1, "disconnect must abort server work");

  // Advance only the focused comparison's 25-second timer; preserve all other timers.
  const realTimeout = global.setTimeout;
  global.setTimeout = (callback, ms, ...args) => realTimeout(callback, ms === 25000 ? 30 : ms, ...args);
  try {
    const fallback = await fetch(base + "/api/shopping-assistant/stream", options);
    const events = (await fallback.text()).trim().split("\n").map(line => JSON.parse(line));
    const final = events.find(event => event.type === "result").result;
    assert.equal(final.partial, true);
    assert.equal(final.recommendations[0].catalog_product_id, 1);
    assert.match(final.message, /external comparison did not finish/i);
    assert.equal(aborted, 2, "deadline must stop external work and retain catalogue facts");
  } finally {global.setTimeout = realTimeout;}
  db.prepare("UPDATE products SET title='Acme Bed Pillows 2-Pack',current_price=5.84 WHERE id=1").run();
  for(const endpoint of ['/api/shopping-assistant','/api/shopping-assistant/stream']) {
    const r=await fetch(base+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:'Is this a good price? fixture-pack '+endpoint,product_id:1,market:'us'})});
    assert.equal(r.status,200);
    const result=endpoint.endsWith('/stream') ? (await r.text()).trim().split('\n').map(line=>JSON.parse(line)).find(e=>e.type==='result').result : await r.json();
    assert.equal(result.recommendations[0].catalog_product_id,1,'Both transports must retain the original pack first');
    assert.equal(result.recommendations[0].unit_price_value,2.92);
    assert.equal(result.recommendations[1].unit_price_value,3.44);
    assert.match(result.recommendations[1].note,/Different pack size/);
    assert.equal(result.result_state,'exact_matches');
    assert(!result.message.includes('Nothing matched exactly'));
  }
  const caHome=await get('/ca');
  assert(!caHome.includes('Explore Halloween'),'Do not advertise an empty regional collection');
  assert(!caHome.includes('See more Halloween finds'),'Do not render an empty homepage preview');
  const caHalloween=await get('/ca/halloween');
  assert(caHalloween.includes('Browse available products'),'Empty direct collection must offer a useful alternative');
  console.log("Audit brands: shared layout, compact search, 24-card paging, matching averages, regions, redirects, previews, cancellation and bounded partial fallback passed.");
  process.exit(0);
})().catch(error => {console.error(error); process.exit(1);});
