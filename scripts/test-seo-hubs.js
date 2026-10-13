const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { guides, GUIDE_MARKETS } = require("../src/seoContent");

const port = 24000 + (process.pid % 15000);
process.env.PORT = String(port);
process.env.BACKEND_API_URL = `http://127.0.0.1:${port}`;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "odd-seo-"));
process.env.WEBSITE_SITE_NAME = "seo-test";
process.env.LIVE_REFRESH_ENABLED = "false";
process.env.SUPPORTED_MARKETS = "us";
process.env.EBAY_CLIENT_ID = "fixture-client";
process.env.EBAY_CLIENT_SECRET = "fixture-secret";
process.env.EBAY_CAMPAIGN_ID = "5339179772";
process.env.ADMIN_KEY = "seo-test-key";
const db = require("../src/db");
require("../app");
const now = new Date().toISOString();
const { id } = db.prepare(`INSERT INTO products(external_id,provider_external_id,market,title,category,image_url,affiliate_url,retailer_name,availability,checked_at,current_price,currency,source,status,updated_at,first_seen_at,last_seen_at,seller_name,seller_rating,seller_feedback_count,shipping_summary,return_summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(
  "us:ebay:seo-fixture", "ebay:seo-fixture", "us", "Office desk organiser", "Office",
  "https://i.ebayimg.com/images/g/test/s-l1600.jpg", "https://www.ebay.com/itm/123456789?campid=5339179772", "eBay", "In stock", now, 20, "USD", "ebay", "published", now, now, now,
  "Fixture seller", 99.5, 1000, "Free delivery", "Returns accepted within 30 days"
);
db.prepare("UPDATE products SET normalized_category='Office',commerce_quality=80,evidence_confidence=80 WHERE id=?").run(id);

const base = `http://127.0.0.1:${port}`;
const schemas = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => {
  const data = JSON.parse(match[1]);
  return data["@graph"] || [data];
});
async function page(route, status = 200) {
  const response = await fetch(base + route);
  assert.equal(response.status, status, route);
  return await response.text();
}
async function run() {
  for (let attempt = 0; ; attempt++) {
    try { await page("/api/status"); break; } catch (error) { if (attempt > 100) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const sitemap = await page("/sitemap.xml");
  assert(sitemap.includes("/us/category/office</loc>"), "a hub must survive when its only product is noindex");
  assert(!sitemap.includes(`-${id}</loc>`), "a bare product must stay out of the sitemap");
  for (const market of GUIDE_MARKETS) {
    for (const guide of guides) assert(sitemap.includes(`/${market}/guides/${guide.slug}</loc>`));
  }
  assert(!sitemap.includes("/fr/guides"), "do not advertise untranslated guides as French");
  for (const guide of guides) {
    const html = await page(`/us/guides/${guide.slug}`);
    assert(html.includes(`rel="canonical" href="https://www.onedailydrop.com/us/guides/${guide.slug}"`));
    assert(html.includes('hrefLang="en-GB"') || html.includes('hreflang="en-GB"'));
    assert(html.includes(guide.title.replace(/&/g, "&amp;")));
    const nodes = schemas(html);
    assert(nodes.some(node => node["@type"] === "Article"));
    assert(nodes.some(node => node["@type"] === "BreadcrumbList"));
    assert(!nodes.some(node => node["@type"] === "FAQPage"));
  }
  await page("/fr/guides/real-vs-fake-discounts", 404);
  await page("/us/guides/does-not-exist", 404);
  const hub = await page("/us/category/office");
  assert(hub.includes("Check compatibility before price"));
  assert(schemas(hub).some(node => node["@type"] === "ItemList"));
  const filtered = await page("/us/category/office?sort=price-asc");
  assert(filtered.includes('content="noindex, follow"'), "filter variants must not compete with the hub");
  const product = await page(`/us/deal/${id}`);
  assert(product.includes('content="noindex, follow"'), "the product evidence gate must stay closed");
  const robots = await page("/robots.txt");
  assert(robots.includes("Disallow: /go/"));
  assert(!robots.includes("Disallow: /us/deal/"), "Google must be able to see product noindex");
  console.log("SEO hubs: routing, schema, canonical/hreflang, sitemap and noindex passed");
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
