const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");
const { localizeProduct } = require("../src/demoTranslations");
const { categoryLabel } = require("../src/i18n");

class TestDatabase {
  constructor(filename) {
    this.database = new DatabaseSync(filename);
  }

  pragma(value) {
    this.database.exec(`PRAGMA ${value}`);
  }

  exec(sql) {
    return this.database.exec(sql);
  }

  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => statement.run(...params)
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

const port = 18088;
process.env.PORT = String(port);
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-seo-"));
process.env.SUPPORTED_MARKETS = "us";
process.env.WEBSITE_SITE_NAME = "onedailydrop-test";
process.env.EBAY_CLIENT_ID = "test-client-id";
process.env.EBAY_CLIENT_SECRET = "test-client-secret";
process.env.EBAY_CAMPAIGN_ID = "5339179772";
process.env.ADMIN_KEY = "test-admin-key";

const db = require("../src/db");
const now = new Date().toISOString();
const insertProduct = db.prepare(`
  INSERT INTO products(
    external_id,provider_external_id,market,product_key,brand,brand_slug,title,category,
    description,image_url,affiliate_url,retailer_shop_url,retailer_name,seller_name,shipping_summary,
    seller_rating,seller_feedback_count,return_summary,availability,checked_at,rating,review_count,current_price,original_price,
    currency,score,selection_reason,source,status,updated_at,first_seen_at,last_seen_at
  ) VALUES(${Array(32).fill("?").join(",")})
`);
const fixtureMarkets = [
  { code:"us", currency:"USD", category:"office gadgets", rating:4.8, reviews:500 },
  { code:"ca", currency:"CAD", category:"car accessories", rating:4.7, reviews:220 },
  { code:"uk", currency:"GBP", category:"travel accessories", rating:4.6, reviews:80 },
  { code:"fr", currency:"EUR", category:"pet supplies", rating:0, reviews:0 },
  { code:"de", currency:"EUR", category:"kitchen gadgets", rating:0, reviews:0 }
];
for (const fixtureMarket of fixtureMarkets) {
  for (let index = 1; index <= 10; index += 1) {
    const brand = index <= 5 ? "Acme" : "Northstar";
    insertProduct.run(
      `${fixtureMarket.code}:ebay-test-${index}`,
      `${fixtureMarket.code}-ebay-test-${index}`,
      fixtureMarket.code,
      `${fixtureMarket.code}-ebay-test-${index}`,
      brand,
      brand.toLowerCase(),
      `eBay Test Product ${index}`,
      fixtureMarket.category,
      `Verified eBay fixture ${index}`,
      `https://i.ebayimg.com/images/g/${fixtureMarket.code}-test-${index}/s-l1600.jpg`,
      `https://www.ebay.com/itm/${fixtureMarket.code}${1000 + index}?campid=5339179772`,
      `https://www.ebay.com/sch/i.html?_nkw=smart+home&campid=5339179772`,
      "eBay",
      `Test Seller ${index}`,
      "Free shipping via Standard Shipping",
      4.99,
      12000 + index,
      "30 calendar days, seller-paid return shipping",
      "In stock",
      now,
      fixtureMarket.rating,
      fixtureMarket.reviews + index,
      18.99 + index,
      28.99 + index,
      fixtureMarket.currency,
      45 - index / 10,
      "Selected with a technical internal score.",
      "ebay",
      "published",
      now,
      now,
      now
    );
  }
}

const archiveDate = "2000-01-01";
const dropProducts = db.prepare("SELECT id,current_price,original_price,currency,score FROM products WHERE market='us' ORDER BY id LIMIT 10").all();
const insertDrop = db.prepare(`
  INSERT INTO daily_drops(
    market,drop_date,product_id,rank,score,current_price,original_price,currency,
    selection_reason,availability_status,selected_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
`);
dropProducts.forEach((product, index) => insertDrop.run(
  "us",
  archiveDate,
  product.id,
  index + 1,
  product.score,
  product.current_price + 5,
  product.original_price,
  product.currency,
  "Archived selection snapshot.",
  "Available",
  now
));

const base = `http://127.0.0.1:${port}`;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const get = route => fetch(`${base}${route}`, { redirect: "manual" });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await get("/robots.txt");
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("SEO test server did not start");
}

async function run() {
  const demoFixture = { source: "demo", external_id: "D003", title: "English title", description: "English description" };
  assert(localizeProduct(demoFixture, "fr").title.includes("prises connectées"), "French demo translation is incomplete");
  assert(localizeProduct(demoFixture, "de").title.includes("WLAN-Steckdosen"), "German demo translation is incomplete");
  assert(categoryLabel("Smart Home", "fr") === "Maison connectée", "French Smart Home category translation is incorrect");
  assert(categoryLabel("Office", "de") === "Büro", "German Office category translation is incorrect");

  require("../app");
  await waitForServer();

  const apex = await fetch(`${base}/us`, {
    redirect: "manual",
    headers: { "x-forwarded-host": "onedailydrop.com" }
  });
  assert(apex.status === 301, "Apex host must return 301");
  assert(apex.headers.get("location") === "https://www.onedailydrop.com/us", "Apex redirect target is incorrect");

  const homepage = await (await get("/us")).text();
  assert(homepage.includes('<html lang="en-US">'), "US homepage language is incorrect");
  assert(homepage.includes('<link rel="canonical" href="https://www.onedailydrop.com/us">'), "US homepage canonical is missing");
  assert(homepage.includes('property="og:site_name" content="OneDailyDrop"'), "Homepage Open Graph metadata is missing");
  assert(homepage.includes("eBay Test Product 1"), "The verified eBay catalog is missing from the US homepage");
  assert(homepage.includes("VIEW DEAL AT eBay"), "The eBay affiliate action is missing from the US homepage");
  assert(homepage.includes('target="_blank" rel="sponsored noopener noreferrer"'), "Retailer actions do not open safely in a new tab");
  assert(homepage.includes("source=home&amp;placement=featured_cta&amp;action=view_deal"), "Homepage outbound attribution is missing");
  assert(homepage.includes('data-track-source="home"') && homepage.includes('data-track-action="view_details"'), "Homepage internal product tracking is missing");
  assert(homepage.includes("OneDailyDrop Score") && homepage.includes("Overall deal score"), "The public OneDailyDrop Score is missing from the homepage");
  assert(homepage.includes("Product rating") && homepage.includes("Seller rating"), "Product and seller ratings are not separated on the homepage");
  assert(!homepage.includes("Check current price on Amazon"), "A retired Amazon fallback remains on the homepage");
  for (const forbidden of ["Development preview", "Sample price", "Rainforest"]) {
    assert(!homepage.includes(forbidden), `US homepage still exposes ${forbidden}`);
  }

  const spanishResponse = await get("/us?lang=es");
  const spanishHomepage = await spanishResponse.text();
  assert(spanishHomepage.includes('<html lang="es-US">'), "US Spanish locale is incorrect");
  assert(spanishHomepage.includes("eBay Test Product 1"), "US Spanish catalog is missing the verified products");
  assert(spanishHomepage.includes("Accesorios de oficina"), "US Spanish live category is not localized");
  assert(spanishHomepage.includes("Entrega gratuita mediante Standard Shipping"), "US Spanish delivery terms are not localized");
  assert(!spanishHomepage.includes("Selected with a technical internal score"), "US Spanish exposes the stored technical selection reason");
  assert(String(spanishResponse.headers.get("set-cookie") || "").includes("odd_lang_us=es"), "US language preference cookie is missing");

  const frenchHomepage = await (await get("/fr")).text();
  assert(frenchHomepage.includes('<html lang="fr-FR">'), "France must default to French");
  assert(frenchHomepage.includes("eBay Test Product 1"), "France live catalog is missing");
  assert(frenchHomepage.includes("Produits pour animaux"), "France live category is not localized");
  assert(frenchHomepage.includes("Livraison gratuite via Standard Shipping"), "France delivery terms are not localized");
  assert(frenchHomepage.includes("Retours acceptés sous 30 jours"), "France return terms are not localized");
  assert(frenchHomepage.includes("Score OneDailyDrop") && frenchHomepage.includes("Note du vendeur"), "France score or seller rating labels are missing");
  assert(frenchHomepage.includes("eBay n’a fourni aucune note produit"), "France missing-rating disclosure is absent");
  for (const forbidden of ["Selected with", "Free shipping via", "30 calendar days", "POPULAR PICK", "CHOIX POPULAIRE"]) {
    assert(!frenchHomepage.includes(forbidden), `France homepage still exposes misleading or untranslated text: ${forbidden}`);
  }

  const franceEnglish = await (await get("/fr?lang=en")).text();
  assert(franceEnglish.includes('<html lang="en-FR">'), "France English locale is incorrect");
  assert(franceEnglish.includes("eBay Test Product 1"), "France English catalog is missing");

  const germanHomepage = await (await get("/de")).text();
  assert(germanHomepage.includes('<html lang="de-DE">'), "Germany must default to German");
  assert(germanHomepage.includes("Küchenhelfer"), "Germany live category is not localized");
  assert(germanHomepage.includes("Kostenlose Lieferung über Standard Shipping"), "Germany delivery terms are not localized");
  assert(germanHomepage.includes("Rückgabe innerhalb von 30 Tagen"), "Germany return terms are not localized");
  assert(germanHomepage.includes("OneDailyDrop-Score") && germanHomepage.includes("Verkäuferbewertung"), "Germany score or seller rating labels are missing");
  assert(!germanHomepage.includes("Selected with"), "Germany exposes the stored technical selection reason");

  const canadaHomepage = await (await get("/ca")).text();
  assert(canadaHomepage.includes('<html lang="en-CA">'), "Canada must default to English");
  const canadaFrench = await (await get("/ca?lang=fr")).text();
  assert(canadaFrench.includes("Accessoires auto"), "Canada French live category is not localized");
  assert(canadaFrench.includes("Livraison gratuite via Standard Shipping"), "Canada French delivery terms are not localized");

  const ukHomepage = await (await get("/uk")).text();
  assert(ukHomepage.includes('<html lang="en-GB">'), "UK homepage language is incorrect");

  const legacyAbout = await get("/about");
  assert(legacyAbout.status === 301, "Legacy unprefixed pages must redirect permanently");
  assert(legacyAbout.headers.get("location") === "/us/about", "Legacy page redirect target is incorrect");

  const robots = await (await get("/robots.txt")).text();
  assert(robots.includes("Disallow: /go/"), "Affiliate redirect paths are not blocked in robots.txt");
  assert(robots.includes("Sitemap: https://www.onedailydrop.com/sitemap.xml"), "Sitemap declaration is missing");

  const sitemap = await (await get("/sitemap.xml")).text();
  assert(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), "Image sitemap namespace is missing");
  assert(sitemap.includes("<image:image>"), "Verified product images are missing from the sitemap");
  assert(sitemap.includes("/deal/") && sitemap.includes("/category/") && sitemap.includes("/brands"), "Verified catalog pages are missing from the sitemap");

  const products = await (await get("/api/products?market=us")).json();
  assert(products.length === 10, "The public US catalog must contain exactly ten verified products");
  assert(products.every(product => product.source === "ebay"), "A non-eBay product source is public");
  assert(products.every(product => product.affiliate_url.includes("campid=5339179772")), "An eBay affiliate link is missing the EPN campaign ID");
  assert(products.every(product => product.current_price > 0 && product.rating > 0), "Verified prices or ratings are missing");

  const status = await (await get("/api/status?market=us")).json();
  assert(status.products === 10, "Catalog status does not count the ten verified products");
  assert(status.provider === "ebay", "The approved eBay provider is not enabled");
  assert(status.requestedProvider === "ebay", "The requested provider is not eBay");
  assert(status.lastRun === null, "Legacy demo refresh history is still exposed");

  const legacyBrands = await get("/brands");
  assert(legacyBrands.status === 301, "Legacy Brands URL must return 301");
  assert(legacyBrands.headers.get("location") === "/us/brands", "Legacy Brands redirect target is incorrect");
  const brandsPageResponse = await get("/us/brands");
  const brandsPage = await brandsPageResponse.text();
  assert(brandsPageResponse.status === 200, "Brands page must be available for the eBay catalog");
  assert(brandsPage.includes("Acme") && brandsPage.includes("Northstar"), "eBay catalog brands are missing");
  assert(sitemap.includes("<loc>https://www.onedailydrop.com/us/brands</loc>"), "Brands page is missing from the sitemap");

  const searchPage = await (await get("/us/search?q=product%202")).text();
  assert(searchPage.includes("eBay Test Product 2"), "Search does not find a verified eBay product");
  assert(searchPage.includes("deal-metrics") && searchPage.includes("OneDailyDrop Score"), "Search results are missing the OneDailyDrop Score");

  const archivePage = await (await get("/us/archive")).text();
  assert(archivePage.includes("OneDailyDrop Score at selection"), "Past Drops does not preserve the score at selection");
  assert(archivePage.includes("Price when selected") && archivePage.includes("Current price"), "Past Drops does not separate selected and current prices");
  assert(archivePage.includes("archive-prices") && archivePage.includes("VIEW DETAILS"), "Past Drops card content or action is missing");

  const productPage = await (await fetch(`${base}/us/deal/${products[0].id}`)).text();
  assert(productPage.includes("OneDailyDrop Score") && productPage.includes("Product rating") && productPage.includes("Seller rating"), "Product page does not separate the three ratings");
  assert(productPage.includes("SHOP ALL ON eBay"), "The attributed retailer shop-all action is missing");
  assert(productPage.includes("action=shop_all"), "The shop-all action is not identified for analytics");
  assert(productPage.includes('target="_blank" rel="sponsored noopener noreferrer"'), "Product retailer actions do not preserve OneDailyDrop in the original tab");

  const internalClick = await fetch(`${base}/api/click-events`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      productId:products[0].id,
      sourcePage:"search",
      placement:"catalog_title",
      action:"view_details"
    })
  });
  assert(internalClick.status === 204, "An internal product click was not accepted");

  const retailerClick = await get(`/us/go/${products[0].id}?source=product&placement=product_cta&action=view_deal`);
  assert(retailerClick.status === 302, "The retailer action did not redirect");
  assert(retailerClick.headers.get("location").includes("campid=5339179772"), "The original affiliate destination was not preserved");

  const shopAllClick = await get(`/us/go/${products[0].id}?source=product&placement=shop_all&action=shop_all`);
  assert(shopAllClick.status === 302, "The retailer shop-all action did not redirect");
  const shopAllLocation = shopAllClick.headers.get("location") || "";
  assert(shopAllLocation.includes("/sch/i.html") && shopAllLocation.includes("campid=5339179772"), "The shop-all link lost retailer attribution");

  const recordedClicks = db.prepare(`
    SELECT source_page,placement,action_type,destination_type,retailer_name
    FROM clicks WHERE product_id=? ORDER BY id
  `).all(products[0].id);
  assert(recordedClicks.some(click => click.source_page === "search" && click.action_type === "view_details" && click.destination_type === "internal"), "Internal click dimensions were not stored");
  assert(recordedClicks.some(click => click.source_page === "product" && click.action_type === "view_deal" && click.destination_type === "retailer"), "Retailer click dimensions were not stored");
  assert(recordedClicks.some(click => click.placement === "shop_all" && click.action_type === "shop_all" && click.retailer_name === "eBay"), "Shop-all click dimensions were not stored");

  const analyticsResponse = await fetch(`${base}/api/admin/click-analytics?days=7`, {
    headers:{"x-admin-key":"test-admin-key"}
  });
  const analytics = await analyticsResponse.json();
  assert(analyticsResponse.status === 200, "Admin click analytics is unavailable");
  assert(Number(analytics.totals.internal_product_clicks) === 1, "Internal click analytics total is incorrect");
  assert(Number(analytics.totals.retailer_clicks) === 2, "Retailer click analytics total is incorrect");

  const missingResponse = await get("/us/deal/not-a-real-product-999999");
  const missingPage = await missingResponse.text();
  assert(missingResponse.status === 410, "Removed product must return HTTP 410");
  assert(missingPage.includes('<meta name="robots" content="noindex,nofollow">'), "410 page must be noindex");

  const trustPage = await (await get("/us/about")).text();
  assert(trustPage.includes('property="og:title" content="About | OneDailyDrop"'), "Trust page Open Graph metadata is missing");
  assert(trustPage.includes('"@type":"WebPage"'), "Trust page schema is missing");

  const frenchMethod = await (await get("/fr/how-we-select-deals")).text();
  assert(frenchMethod.includes("Comment nous classons les offres du jour"), "French methodology title is not localized");
  assert(frenchMethod.includes("Qualité du prix · jusqu’à 30 points"), "French methodology weights are missing");
  assert(frenchMethod.includes("La note du vendeur n’est jamais affichée ni comptée comme une note produit"), "French seller/product rating distinction is missing");
  assert(!frenchMethod.includes("Data-backed scoring"), "French methodology still contains English content");

  const germanMethod = await (await get("/de/how-we-select-deals")).text();
  assert(germanMethod.includes("So ordnen wir die heutigen Angebote ein"), "German methodology title is not localized");
  assert(germanMethod.includes("Preisqualität · bis zu 30 Punkte"), "German methodology weights are missing");
  assert(germanMethod.includes("Eine Verkäuferbewertung wird niemals als Produktbewertung"), "German seller/product rating distinction is missing");

  console.log("eBay-catalog SEO route validation passed");
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
