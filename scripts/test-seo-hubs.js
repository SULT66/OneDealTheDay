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

/* An Electronics listing from one of the laptop brands, so the guide that
   matches a list of brands is tested against a listing it has to find by brand
   and not by category — Electronics holds 915 listings and almost none of them
   are laptops. */
const laptop = db.prepare(`INSERT INTO products(external_id,provider_external_id,market,title,brand,category,image_url,affiliate_url,retailer_name,availability,checked_at,current_price,currency,source,status,updated_at,first_seen_at,last_seen_at,seller_name,seller_rating,seller_feedback_count,shipping_summary,return_summary) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`).get(
  "us:ebay:seo-laptop", "ebay:seo-laptop", "us", "HP 15-fd0000 Laptop 15.6 inch", "HP", "Electronics",
  "https://i.ebayimg.com/images/g/laptop/s-l1600.jpg", "https://www.ebay.com/itm/987654321?campid=5339179772", "eBay", "In stock", now, 399, "USD", "ebay", "published", now, now, now,
  "Fixture seller", 99.5, 1000, "Free delivery", "Returns accepted within 30 days"
).id;
db.prepare("UPDATE products SET normalized_category='Electronics',commerce_quality=80,evidence_confidence=80 WHERE id=?").run(laptop);

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
  /*
   * The sitemap is built once and kept.
   *
   * It read the whole products table twice and ran the evidence gate — which
   * queries the database per product — over everything that survived. Measured
   * from outside on 2026-10-14: thirteen seconds, twenty-nine under load, and a
   * 502 when two requests overlapped. Search Console reported "Couldn’t fetch"
   * and zero discovered pages for a file that serves 505 of them correctly.
   * Googlebot does not wait that long, so the cost of losing this cache is the
   * whole of search discovery, silently.
   */
  const firstSitemap = await fetch(base + "/sitemap.xml");
  assert.equal(firstSitemap.headers.get("x-odd-sitemap"), "MISS", "the first build should say so");
  const secondSitemap = await fetch(base + "/sitemap.xml");
  assert.equal(secondSitemap.headers.get("x-odd-sitemap"), "HIT", "the sitemap is being rebuilt on every request again");
  assert.equal(await firstSitemap.text(), await secondSitemap.text(), "the cached sitemap differs from the built one");

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
    /*
     * No FAQPage, on purpose, and this assertion is the reason written down.
     *
     * Google restricted FAQ rich results to authoritative government and health
     * sites in 2023 and withdrew them from those too on 7 May 2026, so the
     * markup now produces nothing in Search for any site. It was never a
     * ranking signal. Adding it would be bytes and a maintenance surface in
     * exchange for an appearance that no longer exists — and a plan written
     * from older advice will keep recommending it, which is what this line is
     * here to answer.
     */
    assert(!nodes.some(node => node["@type"] === "FAQPage"));
  }

  /*
   * A guide that covers a niche rather than a brand finds its listings.
   *
   * The laptop guide spans seven makers, because "laptop deals" is not one
   * brand and its category is 915 listings of which almost none are laptops.
   * Matching by category alone would fill it with phone cases; matching one
   * brand would leave six out.
   */
  const laptopGuide = await page("/us/guides/laptop-pc-deals");
  assert(laptopGuide.includes("HP 15-fd0000"), "the laptop guide no longer finds a listing from one of its brands");
  assert(
    !laptopGuide.includes("Office desk organiser"),
    "the laptop guide is pulling in whatever shares its category",
  );
  const huntingGuide = await page("/us/guides/hunting-outdoor-deals");
  assert(
    !huntingGuide.includes("HP 15-fd0000"),
    "a brand guide is showing a listing from another brand",
  );
  await page("/fr/guides/real-vs-fake-discounts", 404);
  await page("/us/guides/does-not-exist", 404);
  const hub = await page("/us/category/office");
  assert(hub.includes("Check compatibility before price"));
  assert(schemas(hub).some(node => node["@type"] === "ItemList"));
  const filtered = await page("/us/category/office?sort=price-asc");
  assert(filtered.includes('content="noindex, follow"'), "filter variants must not compete with the hub");
  const product = await page(`/us/deal/${id}`);
  assert(product.includes('content="noindex, follow"'), "the product evidence gate must stay closed");
  /*
   * The page every other page cites carried no structured data at all: no
   * Article saying what it is, no breadcrumb saying where it sits. It is the
   * one a reviewer opens first and the whole E-E-A-T case rests on it.
   */
  const methodologyPage = await page("/us/how-we-select-deals");
  const methodologyNodes = schemas(methodologyPage);
  assert(methodologyNodes.some(node => node["@type"] === "Article"), "the methodology page describes itself to nobody");
  assert(methodologyNodes.some(node => node["@type"] === "BreadcrumbList"));
  assert(!methodologyNodes.some(node => node["@type"] === "FAQPage"), "see the note above on FAQ rich results");

  /*
   * Pinterest has to find its proof on the homepage.
   *
   * Claiming the domain is what attributes pins linking here to our account:
   * without it there is no analytics on which pin earned a visit, and no Rich
   * Pins, which is what puts the live price on a pin from the Product markup
   * each listing already carries. The tag is published deliberately and is not
   * a secret; losing it silently un-claims the domain, and nothing about the
   * site would look wrong.
   */
  const home = await page("/us");
  assert(
    home.includes(`name="p:domain_verify" content="c9896fe5c98d503467e12aaa50e2f383"`),
    "the Pinterest domain claim is gone from the homepage, which un-claims the site without any other symptom",
  );

  /*
   * The same page at five market prefixes, told apart.
   *
   * These eleven carried a canonical and no hreflang, which is the half that
   * does nothing on its own: a canonical pointing at itself says this URL is
   * the original of itself, while /us/about, /ca/about, /uk/about, /fr/about
   * and /de/about remained five pages of identical English competing with one
   * another. hreflang is the part that says they are one page for five places.
   */
  for (const route of [
    "/us/about", "/us/stores", "/us/coupons", "/us/archive", "/us/contact",
    "/us/terms", "/us/privacy", "/us/affiliate-disclosure", "/us/editorial-policy",
    "/us/price-disclaimer", "/us/for-retailers",
  ]) {
    const html = await page(route);
    assert(
      /hrefLang="en-US"/i.test(html) && /hrefLang="de-DE"/i.test(html) && /hrefLang="x-default"/i.test(html),
      route + " is back to competing with its own translations at the other market prefixes",
    );
    assert(/rel="canonical"/.test(html), route + " lost its canonical");
  }

  /*
   * Who publishes this.
   *
   * The page that describes the organization carried nothing describing the
   * organization. It is the half of E-E-A-T an affiliate site is judged
   * hardest on, and it was the one page where the claim could be made.
   */
  const about = schemas(await page("/us/about"));
  assert(about.some(node => node["@type"] === "Organization"), "the about page names no publisher");
  assert(about.some(node => node["@type"] === "BreadcrumbList"));

  /* A hub whose whole job is to list things listed nothing. */
  const guidesHub = schemas(await page("/us/guides"));
  assert(guidesHub.some(node => node["@type"] === "ItemList"), "the guides hub lists nothing to a crawler");
  assert(guidesHub.some(node => node["@type"] === "BreadcrumbList"));

  const robots = await page("/robots.txt");
  assert(robots.includes("Disallow: /go/"));
  assert(!robots.includes("Disallow: /us/deal/"), "Google must be able to see product noindex");
  console.log("SEO hubs: routing, schema, canonical/hreflang, sitemap, niche guides and noindex passed");
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
