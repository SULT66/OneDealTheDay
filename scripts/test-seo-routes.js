const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");
const { localizeProduct } = require("../src/demoTranslations");
const { categoryLabel } = require("../src/i18n");
const { RELEASE_ID } = require("../src/release");

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
  { code:"fr", currency:"EUR", category:"pet supplies", rating:4.6, reviews:80 },
  { code:"de", currency:"EUR", category:"kitchen gadgets", rating:4.6, reviews:80 }
];
for (const fixtureMarket of fixtureMarkets) {
  for (let index = 1; index <= 10; index += 1) {
    const brand = index <= 5 ? "Acme" : "Northstar";
    insertProduct.run(
      `${fixtureMarket.code}:ebay-test-${index}`,
      `${fixtureMarket.code}-ebay-test-${index}`,
      fixtureMarket.code,
      index <= 2 ? "gtin:00012345678905" : `${fixtureMarket.code}-ebay-test-${index}`,
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
  assert(categoryLabel("Electronics", "fr") === "Électronique", "French Electronics category translation is incorrect");
  assert(categoryLabel("Office", "de") === "Büro", "German Office category translation is incorrect");

  require("../app");
  await waitForServer();

  const apex = await fetch(`${base}/us`, {
    redirect: "manual",
    headers: { "x-forwarded-host": "onedailydrop.com" }
  });
  assert(apex.status === 301, "Apex host must return 301");
  assert(apex.headers.get("location") === "https://www.onedailydrop.com/us", "Apex redirect target is incorrect");
  const apexDuplicate = await fetch(`${base}/US/?ref=test`, {
    redirect: "manual",
    headers: { "x-forwarded-host": "onedailydrop.com" }
  });
  assert(apexDuplicate.headers.get("location") === "https://www.onedailydrop.com/us?ref=test", "Host and path duplicates must normalize in one redirect");

  const azureHtml = await fetch(`${base}/us`, {
    redirect: "manual",
    headers: { "x-forwarded-host": "onedealtheday-g3dme0aghzerc3a2.centralus-01.azurewebsites.net" }
  });
  assert(azureHtml.status === 301, "The Azure production hostname must not serve duplicate public HTML");
  assert(azureHtml.headers.get("location") === "https://www.onedailydrop.com/us", "Azure HTML redirect target is incorrect");
  const azureApi = await fetch(`${base}/api/status?market=us`, {
    redirect: "manual",
    headers: { "x-forwarded-host": "onedealtheday-g3dme0aghzerc3a2.centralus-01.azurewebsites.net" }
  });
  assert(azureApi.status === 200, "Azure API health endpoints must remain available to workflows");
  assert(azureApi.headers.get("x-robots-tag") === "noindex, nofollow", "Catalog status endpoint must not be indexed");
  const azureStatus = await azureApi.json();
  assert(azureStatus.releaseId === RELEASE_ID, "Production release marker is missing");
  assert(azureStatus.taxonomyVersion === "catalog-taxonomy-v2", "Production taxonomy marker is missing");

  const searchApi = await fetch(`${base}/api/search?market=us&q=eBay%20Test%20Product&max_price=500&sort=price_asc&page=1&limit=5`);
  assert(searchApi.status === 200, "Search API route is unavailable");
  assert(searchApi.headers.get("x-robots-tag") === "noindex, nofollow", "Search API must not be indexed");
  const searchResult = await searchApi.json();
  assert(searchResult.ranking_model === "ranking-v1", "Search API ranking contract is missing");
  assert(searchResult.pagination.total > 0 && searchResult.products.length <= 5, "Search API pagination is invalid");
  assert(searchResult.facets.categories.length > 0 && searchResult.facets.merchants.length > 0, "Search API facets are missing");
  assert(searchResult.products.every((product, index, products) => index === 0 || Number(products[index - 1].landed_cost || products[index - 1].current_price) <= Number(product.landed_cost || product.current_price)), "Search API price sorting is unstable");
  const invalidSearch = await fetch(`${base}/api/search?market=us&min_price=500&max_price=100`);
  assert(invalidSearch.status === 400, "Search API accepted contradictory price filters");

  const trailingSlash = await get("/us/?ref=test");
  assert(trailingSlash.status === 301, "Trailing-slash duplicate must redirect permanently");
  assert(trailingSlash.headers.get("location") === "/us?ref=test", "Trailing-slash redirect must preserve the query string");
  const uppercaseMarket = await get("/US?ref=test");
  assert(uppercaseMarket.status === 301, "Uppercase market duplicate must redirect permanently");
  assert(uppercaseMarket.headers.get("location") === "/us?ref=test", "Market normalization redirect is incorrect");

  const homepageResponse = await get("/us");
  const homepage = await homepageResponse.text();
  assert(!homepageResponse.headers.has("x-powered-by"), "Homepage still exposes the Express implementation");
  assert(homepageResponse.headers.has("x-content-type-options"), "Homepage is missing Helmet security headers");
  assert(homepage.includes('<html lang="en-US">'), "US homepage language is incorrect");
  assert(homepage.includes('<link rel="canonical" href="https://www.onedailydrop.com/us">'), "US homepage canonical is missing");
  assert(homepage.includes('data-homepage-mode="search-first-v1"'), "Day 9 search-first homepage marker is missing");
  assert(homepage.includes('id="shopping-search"') && homepage.includes('id="homepageSearchForm"'), "Homepage search is not the primary entry point");
  assert(homepage.includes('id="homepageSearchInput"') && homepage.includes('action="/us/search" method="get"'), "Homepage search form does not use the market search route");
  assert(!homepage.includes('class="header-search-link"'), "Homepage still exposes the duplicate Search deals header link");
  assert(!homepage.includes('id="category-navigation-title"'), "Categories are still duplicated in the homepage body");
  assert(homepage.includes('id="store-navigation-title"'), "Store navigation is missing below search");
  const storeNavigation = homepage.match(/<section class="shopping-navigation-card store-navigation-card"[\s\S]*?<\/section>/)?.[0] || "";
  assert(storeNavigation.includes("Verified Store"), "Store navigation is missing its verified-store label");
  assert(!/\b[\d,.]+\s+products\b/i.test(storeNavigation), "Store navigation still exposes catalog product counts");
  assert(homepage.includes('id="categoryMenu" class="mega-menu" hidden'), "The single top category dropdown is missing");
  assert(!homepage.includes('id="interestFieldset"') && !homepage.includes('name="categories"'), "Subscription still duplicates category choices");
  assert(!homepage.includes("Home &amp; Garden &gt;") && !homepage.includes("Furniture &gt;"), "A raw affiliate category hierarchy escaped into the homepage");
  assert(homepage.includes('/us/search?merchant=eBay'), "Homepage store navigation does not use the merchant filter");
  assert(homepage.includes('data-search-experience="unified-intent-v1"'), "Day 12 unified search marker is missing");
  assert((homepage.match(/role="search"/g) || []).length === 1, "Homepage still exposes competing search forms");
  assert(!homepage.includes('class="header-ai"') && !homepage.includes('id="searchInput"'), "Legacy header search or Delia entry point is still rendered");
  assert(homepage.includes('id="top-picks"') && homepage.includes('class="top-picks-disclosure"'), "Top 10 is not available through its separate control");
  assert(homepage.indexOf('id="shopping-search"') < homepage.indexOf('id="top-picks"'), "Top 10 appears before the primary homepage search");
  assert(homepage.includes('property="og:site_name" content="OneDailyDrop"'), "Homepage Open Graph metadata is missing");
  assert(homepage.includes("eBay Test Product 1"), "The verified eBay catalog is missing from the US homepage");
  assert(homepage.includes("VIEW DEAL AT eBay"), "The eBay affiliate action is missing from the US homepage");
  assert(homepage.includes('target="_blank" rel="sponsored noopener noreferrer"'), "Retailer actions do not open safely in a new tab");
  assert(homepage.includes("source=home&amp;placement=featured_cta&amp;action=view_deal"), "Homepage outbound attribution is missing");
  assert(homepage.includes('data-track-source="home"') && homepage.includes('data-track-action="view_details"'), "Homepage internal product tracking is missing");
  assert(homepage.includes('<link rel="preconnect" href="https://i.ebayimg.com">'), "Homepage image origin preconnect is missing");
  assert(homepage.includes('decoding="async" fetchpriority="high"'), "Homepage LCP image priority is missing");
  assert(homepage.includes('loading="lazy" decoding="async"'), "Below-the-fold homepage images are not deferred");
  assert(homepage.includes('class="description editorial-teaser"'), "Homepage cards do not use the compact Stage 4 editorial teaser");
  assert(homepage.includes('/styles.css?v=20260815-public-taxonomy-v2'), `Public-taxonomy homepage stylesheet is not cache-busted: ${homepage.match(/styles\.css[^\"]+/)?.[0] || "missing"}`);
  assert(homepage.includes('/app.js?v=20260815-public-taxonomy-v2'), "Public-taxonomy homepage script is not cache-busted");
  const cachedHomepageResponse = await get("/us");
  assert(cachedHomepageResponse.headers.get("x-odd-cache") === "HIT", "Homepage microcache is not serving repeated navigation");
  assert(String(cachedHomepageResponse.headers.get("cache-control") || "").includes("max-age=60"), "Homepage browser cache is missing");
  assert(homepage.includes("OneDailyDrop Score") && homepage.includes("Overall deal score"), "The public OneDailyDrop Score is missing from the homepage");
  assert(!homepage.includes("<small>Evidence confidence</small>"), "Internal evidence confidence is still exposed as a public score");
  assert(homepage.includes("AI Shopping Assistant") && homepage.includes("data-shopping-assistant-open"), "The AI Shopping Assistant entry point is missing");
  assert(homepage.includes('/shopping-assistant.js?v=20260814-day12-product-gate'), "The Delia Shopping Assistant client is missing");
  for (const forbidden of ["Trending Drops", "New Drops", "Yesterday's Drops"]) {
    assert(!homepage.includes(`<h2>${forbidden}</h2>`), `Homepage still exposes a misleading collection: ${forbidden}`);
  }
  assert(!homepage.includes("[object Object]"), "Subscription categories render as [object Object]");
  assert(homepage.includes('<span style="--weight:20%"><b>20%</b> Product quality</span>'), "Homepage product-quality weight is stale");
  assert(homepage.includes('<span style="--weight:10%"><b>10%</b> Demand &amp; usefulness</span>'), "Homepage demand weight is missing");
  assert(!homepage.includes("<b>5%</b> Freshness"), "Homepage still shows the retired freshness weight");
  assert(homepage.includes("Product rating") && homepage.includes("Seller rating"), "Product and seller ratings are not separated on the homepage");
  assert(!homepage.includes("Check current price on Amazon"), "A retired Amazon fallback remains on the homepage");
  for (const forbidden of ["Development preview", "Sample price", "Rainforest"]) {
    assert(!homepage.includes(forbidden), `US homepage still exposes ${forbidden}`);
  }

  const spanishResponse = await get("/us?lang=es");
  const spanishHomepage = await spanishResponse.text();
  assert(spanishHomepage.includes('<html lang="es-US">'), "US Spanish locale is incorrect");
  assert(spanishHomepage.includes("eBay Test Product 1"), "US Spanish catalog is missing the verified products");
  assert(spanishHomepage.includes("Oficina"), "US Spanish live category is not localized");
  assert(spanishHomepage.includes("Tienda verificada"), "US Spanish verified-store label is not localized");
  assert(spanishHomepage.includes("Entrega gratuita mediante Standard Shipping"), "US Spanish delivery terms are not localized");
  assert(!spanishHomepage.includes("Selected with a technical internal score"), "US Spanish exposes the stored technical selection reason");
  assert(String(spanishResponse.headers.get("set-cookie") || "").includes("odd_lang_us=es"), "US language preference cookie is missing");
  assert(spanishHomepage.includes('<meta name="robots" content="noindex,follow">'), "Non-default language query must not compete with the canonical market page");
  assert(String(spanishResponse.headers.get("x-robots-tag") || "").includes("noindex"), "Non-default language query is missing an X-Robots-Tag safeguard");

  const frenchHomepage = await (await get("/fr")).text();
  assert(frenchHomepage.includes('<html lang="fr-FR">'), "France must default to French");
  assert(frenchHomepage.includes("eBay Test Product 1"), "France live catalog is missing");
  assert(frenchHomepage.includes("Produits pour animaux"), "France live category is not localized");
  assert(frenchHomepage.includes("Enseigne vérifiée"), "France verified-store label is not localized");
  assert(frenchHomepage.includes("Livraison gratuite via Standard Shipping"), "France delivery terms are not localized");
  assert(frenchHomepage.includes("Retours acceptés sous 30 jours"), "France return terms are not localized");
  assert(frenchHomepage.includes("Score OneDailyDrop") && frenchHomepage.includes("Note du vendeur"), "France score or seller rating labels are missing");
  for (const forbidden of ["Selected with", "Free shipping via", "30 calendar days", "POPULAR PICK", "CHOIX POPULAIRE"]) {
    assert(!frenchHomepage.includes(forbidden), `France homepage still exposes misleading or untranslated text: ${forbidden}`);
  }

  const franceEnglish = await (await get("/fr?lang=en")).text();
  assert(franceEnglish.includes('<html lang="en-FR">'), "France English locale is incorrect");
  assert(franceEnglish.includes("eBay Test Product 1"), "France English catalog is missing");

  const germanHomepage = await (await get("/de")).text();
  assert(germanHomepage.includes('<html lang="de-DE">'), "Germany must default to German");
  assert(germanHomepage.includes("Wohnen und Küche"), "Germany live category is not localized");
  assert(germanHomepage.includes("Geprüfter Shop"), "Germany verified-store label is not localized");
  assert(germanHomepage.includes("Kostenlose Lieferung über Standard Shipping"), "Germany delivery terms are not localized");
  assert(germanHomepage.includes("Rückgabe innerhalb von 30 Tagen"), "Germany return terms are not localized");
  assert(germanHomepage.includes("OneDailyDrop-Score") && germanHomepage.includes("Verkäuferbewertung"), "Germany score or seller rating labels are missing");
  assert(!germanHomepage.includes("Selected with"), "Germany exposes the stored technical selection reason");

  const canadaHomepage = await (await get("/ca")).text();
  assert(canadaHomepage.includes('<html lang="en-CA">'), "Canada must default to English");
  const canadaFrench = await (await get("/ca?lang=fr")).text();
  assert(canadaFrench.includes("Auto"), "Canada French live category is not localized");
  assert(canadaFrench.includes("Livraison gratuite via Standard Shipping"), "Canada French delivery terms are not localized");

  const ukHomepage = await (await get("/uk")).text();
  assert(ukHomepage.includes('<html lang="en-GB">'), "UK homepage language is incorrect");

  const legacyAbout = await get("/about");
  assert(legacyAbout.status === 301, "Legacy unprefixed pages must redirect permanently");
  assert(legacyAbout.headers.get("location") === "/us/about", "Legacy page redirect target is incorrect");
  const legacyHtmlAbout = await get("/fr/about.html?ref=legacy");
  assert(legacyHtmlAbout.status === 301, "Legacy .html page must redirect permanently");
  assert(legacyHtmlAbout.headers.get("location") === "/fr/about?ref=legacy", "Legacy .html page creates a redirect chain or loses its market");

  const frenchAboutResponse = await get("/fr/about");
  const frenchAbout = await frenchAboutResponse.text();
  assert(frenchAbout.includes('<link rel="canonical" href="https://www.onedailydrop.com/fr/about">'), "Regional trust-page canonical is incorrect");
  assert(!frenchAbout.includes('<link rel="canonical" href="https://www.onedailydrop.com/about">'), "Legacy unprefixed trust-page canonical remains");
  assert(frenchAbout.includes('hreflang="en-US" href="https://www.onedailydrop.com/us/about"'), "Trust-page hreflang cluster is incomplete");
  assert(frenchAbout.includes('hreflang="fr-FR" href="https://www.onedailydrop.com/fr/about"'), "Trust-page self-referencing hreflang is missing");
  const frenchAboutEnglish = await get("/fr/about?lang=en");
  const frenchAboutEnglishHtml = await frenchAboutEnglish.text();
  assert(frenchAboutEnglishHtml.includes('<meta name="robots" content="noindex,follow">'), "Optional trust-page language must be noindex");
  assert(String(frenchAboutEnglish.headers.get("x-robots-tag") || "").includes("noindex"), "Optional trust-page language is missing the response-level noindex directive");

  const robots = await (await get("/robots.txt")).text();
  assert(robots.includes("Disallow: /go/"), "Affiliate redirect paths are not blocked in robots.txt");
  assert(robots.includes("Sitemap: https://www.onedailydrop.com/sitemap.xml"), "Sitemap declaration is missing");

  const sitemap = await (await get("/sitemap.xml")).text();
  assert(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), "Image sitemap namespace is missing");
  assert(sitemap.includes("<image:image>"), "Verified product images are missing from the sitemap");
  assert(sitemap.includes("/deal/") && sitemap.includes("/category/") && sitemap.includes("/brands"), "Verified catalog pages are missing from the sitemap");
  assert(sitemap.includes('<loc>https://www.onedailydrop.com/fr/about</loc>') && sitemap.includes('hreflang="fr-FR" href="https://www.onedailydrop.com/fr/about"'), "Regional trust pages or their sitemap alternates are missing");
  for (const forbidden of ["/search", "/go/", "?lang="]) {
    assert(!sitemap.includes(forbidden), `Sitemap contains a non-canonical URL: ${forbidden}`);
  }
  const sitemapLocations = [...sitemap.matchAll(/<loc>(https:\/\/www\.onedailydrop\.com[^<]+)<\/loc>/g)].map(match => match[1]);
  assert(sitemapLocations.length === new Set(sitemapLocations).size, "Sitemap contains duplicate canonical URLs");
  for (const location of sitemapLocations) {
    const sitemapUrl = new URL(location);
    const response = await get(`${sitemapUrl.pathname}${sitemapUrl.search}`);
    const html = await response.text();
    assert(response.status === 200, `Sitemap URL does not return 200: ${location}`);
    const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map(match => match[1]);
    assert(canonicals.length === 1 && canonicals[0] === location, `Sitemap URL has a missing, duplicate or conflicting canonical: ${location}`);
    assert(!html.includes('<meta name="robots" content="noindex'), `Sitemap contains a noindex page: ${location}`);
    const structuredData = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => match[1]);
    assert(structuredData.length > 0, `Sitemap URL is missing structured data: ${location}`);
    structuredData.forEach(value => JSON.parse(value));
  }
  const sitemapSet = new Set(sitemapLocations);
  const sitemapAlternates = [...sitemap.matchAll(/<xhtml:link rel="alternate" hreflang="[^"]+" href="([^"]+)"\/>/g)].map(match => match[1]);
  sitemapAlternates.forEach(location => assert(sitemapSet.has(location), `Hreflang target is not a canonical sitemap URL: ${location}`));

  const products = await (await get("/api/products?market=us")).json();
  assert(products.length === 9, "The public US catalog must deduplicate equivalent verified listings");
  assert(products.every(product => product.display_score >= 82 && product.display_score <= 95), "A qualified public Deal Score escaped the calibrated 82-95 range");
  const publicProductKeys = products.map(product => product.product_key).filter(Boolean);
  assert(new Set(publicProductKeys).size === publicProductKeys.length, "The production API exposed a duplicate product identity");
  assert(products.every(product => product.source === "ebay"), "A non-eBay product source is public");
  assert(products.every(product => product.affiliate_url.includes("campid=5339179772")), "An eBay affiliate link is missing the EPN campaign ID");
  assert(products.every(product => product.current_price > 0 && product.rating > 0), "Verified prices or ratings are missing");
  const compactResponse = await get("/api/products?market=us&limit=10&compact=1");
  const compactBody = await compactResponse.text();
  const compactProducts = JSON.parse(compactBody);
  assert(compactProducts.length <= 10, "Compact homepage catalog ignored its limit");
  assert(compactBody.length < 40000, `Compact homepage catalog is still too large: ${compactBody.length} bytes`);
  assert(!compactBody.includes('affiliate_url') && !compactBody.includes('score_breakdown'), "Compact homepage catalog leaked unused heavy fields");
  assert(compactProducts.every(product => /^\/us\/deal\/.+-\d+$/.test(product.deal_url || "")), "Compact homepage catalog is missing canonical product detail URLs");
  const cachedCompactResponse = await get("/api/products?market=us&limit=10&compact=1");
  assert(cachedCompactResponse.headers.get("x-odd-cache") === "HIT", "Compact catalog microcache is not active");
  const assistantStatus = await (await get("/api/shopping-assistant/status")).json();
  assert(assistantStatus.available === false, "Assistant status must reflect a missing test API key");

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

  const searchPage = await (await get("/us/search?q=product%203")).text();
  assert(searchPage.includes("eBay Test Product 3"), "Search does not find a verified eBay product");
  assert(!searchPage.includes("eBay Test Product 2"), "Search reintroduced a duplicate GTIN listing");
  assert(searchPage.includes("deal-metrics") && searchPage.includes("OneDailyDrop Score"), "Search results are missing the OneDailyDrop Score");
  assert(searchPage.includes('data-analytics-page="search"') && searchPage.includes('data-analytics-query="product 3"'), "Search analytics context is missing");
  assert(searchPage.includes('data-results-ui="facets-sorting-badges-v1"'), "Day 10 Results UI marker is missing");
  assert(searchPage.includes('/styles.css?v=20260815-public-taxonomy-v2'), "Public-taxonomy results stylesheet is not cache-busted");
  assert(searchPage.includes('<meta name="robots" content="noindex,follow">'), "Search results must remain noindex");
  assert(searchPage.includes("data-results-filters") && searchPage.includes('class="search-sort"'), "Search facets or sorting controls are missing");
  assert(searchPage.includes("search-badge-match") && searchPage.includes("Paid placement never changes them"), "Transparent result badges or their explanation are missing");
  assert(searchPage.includes('name="category"') && searchPage.includes('name="merchant"') && searchPage.includes('name="availability"'), "Search filter parameters are incomplete");
  assert(searchPage.includes('name="sort"') && searchPage.includes('value="price_asc"'), "Search sorting options are incomplete");
  assert(/Showing 1–\d+ of \d+ products/.test(searchPage), "Search result range does not use API pagination totals");
  const merchantSearchPage = await (await get("/us/search?merchant=eBay")).text();
  assert(merchantSearchPage.includes("eBay Test Product 1"), "Store navigation filter does not find the merchant catalog");
  const intentSearchPage = await (await get("/us/search?q=product%20under%20%24103%20at%20eBay")).text();
  assert(intentSearchPage.includes('data-search-intent="parsed-v1"'), "Natural-language search was not parsed by Delia");
  assert(intentSearchPage.includes('class="active-search-filters is-intent-driven"'), "Inferred filters are not visible to the shopper");
  assert(intentSearchPage.includes("eBay") && intentSearchPage.includes("$103.00"), "Inferred merchant or budget filter is missing");
  const sortedSearchPage = await (await get("/us/search?q=product&merchant=eBay&sort=price_asc")).text();
  assert(sortedSearchPage.includes('option value="price_asc" selected'), "Selected search sort is not preserved in the UI");
  assert(sortedSearchPage.includes('name="merchant" value="eBay" checked'), "Selected merchant facet is not preserved in the UI");
  const spanishSearchPage = await (await get("/us/search?q=product&lang=es")).text();
  assert(spanishSearchPage.includes("Filtros activos") || spanishSearchPage.includes("Calidad de oferta"), "Day 10 search controls are not localized in Spanish");
  const germanSearchPage = await (await get("/de/search?q=product")).text();
  assert(germanSearchPage.includes("Beste Übereinstimmung") && germanSearchPage.includes("Angebotsqualität"), "Day 10 search controls are not localized in German");
  const invalidFilterSearch = await (await get("/us/search?q=product&min_price=500&max_price=100")).text();
  assert(invalidFilterSearch.includes("filters were invalid and have been reset"), "Invalid UI filters do not recover safely");
  const outOfRangeSearch = await (await get("/us/search?q=product&page=999")).text();
  assert(!/Showing \d+–\d+ of 0 products/.test(outOfRangeSearch) && outOfRangeSearch.includes("search-result-card"), "Out-of-range result page is not clamped safely");

  const archivePage = await (await get("/us/archive")).text();
  assert(archivePage.includes("OneDailyDrop Score at selection"), "Past Drops does not preserve the score at selection");
  assert(archivePage.includes("Price when selected") && archivePage.includes("Current price"), "Past Drops does not separate selected and current prices");
  assert(archivePage.includes("archive-prices") && archivePage.includes("VIEW DETAILS"), "Past Drops card content or action is missing");

  const productPage = await (await fetch(`${base}/us/deal/${products[0].id}`)).text();
  assert(productPage.includes("OneDailyDrop Score") && productPage.includes("Product rating") && productPage.includes("Seller rating"), "Product page does not separate the three ratings");
  assert(productPage.includes('id="buying-brief"') && productPage.includes("ONEDAILYDROP BUYING BRIEF"), "The Stage 4 buying brief is missing");
  assert(productPage.includes("The useful details, without the sales-page noise"), "The compact editorial structure is missing");
  assert(productPage.includes("Verified strengths") && productPage.includes("Watch-outs"), "The product page does not separate strengths and limitations");
  assert(productPage.includes("What this listing is") && productPage.includes("Who it may suit") && productPage.includes("What to check before buying"), "The buying brief omits required editorial sections");
  assert(productPage.includes("Alternatives worth comparing") && productPage.includes("alternative-grid"), "Relevant alternatives are missing from the product page");
  assert(productPage.includes('data-product-offer-ui="reliable-entity-v1"') && productPage.includes('class="product-offer-summary"'), "Day 11 product/offer UI marker or summary is missing");
  assert(productPage.includes('data-offer-match="gtin"') && productPage.includes("Matched by validated GTIN"), "Reliable entity-match evidence is not visible");
  assert(productPage.includes("Compare current offers") && productPage.includes('data-offer-comparison="reliable-entity-v1"') && productPage.includes("placement=offer_comparison"), "Reliable matching offers are not rendered with analytics");
  assert(productPage.includes("BEST CURRENT PRICE") && productPage.includes("data-verified-offer"), "Offer list does not identify the strongest current price");
  assert(productPage.includes('"@type":"Offer"'), "Product structured data is missing real Offer nodes");
  const productCanonical = productPage.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  assert(productCanonical && productPage.includes(`"@type":"Offer","url":"${productCanonical}"`), "Offer structured data does not use the crawlable product canonical");
  assert(!productPage.includes('"@type":"Offer","url":"https://www.onedailydrop.com/us/go/'), "Offer structured data points at a blocked tracking redirect");
  assert(productPage.includes('<link rel="preconnect" href="https://i.ebayimg.com">'), "Product image origin preconnect is missing");
  assert(productPage.includes('decoding="async" fetchpriority="high"'), "Product hero image priority is missing");
  assert(!productPage.includes("waterproof") && !productPage.includes("lifetime warranty"), "The editorial page invented product specifications");
  assert(productPage.includes("SHOP ALL ON eBay"), "The attributed retailer shop-all action is missing");
  assert(productPage.includes("action=shop_all"), "The shop-all action is not identified for analytics");
  assert(productPage.includes('target="_blank" rel="sponsored noopener noreferrer"'), "Product retailer actions do not preserve OneDailyDrop in the original tab");
  assert(productPage.includes("data-ask-delia") && productPage.includes("/shopping-assistant.js?v=20260814-day12-product-gate"), "The contextual Delia action is not available on product pages");
  assert(!productPage.includes("<small>Evidence confidence</small>"), "Product pages still expose internal evidence confidence");
  const cachedProductResponse = await fetch(`${base}/us/deal/${products[0].id}`);
  assert(cachedProductResponse.headers.get("x-odd-cache") === "HIT", "Product-page microcache is not active");
  const productCacheControl = String(cachedProductResponse.headers.get("cache-control") || "");
  assert(productCacheControl.includes("max-age=120"), "Product-page browser cache is missing");
  assert(productCacheControl.includes("s-maxage=600"), "Product-page shared cache is missing");

  const staticAsset = await get("/styles.css?v=20260815-public-taxonomy-v2");
  assert(String(staticAsset.headers.get("cache-control") || "").includes("immutable"), "Versioned static assets are not cached immutably");

  const franceProducts = await (await get("/api/products?market=fr")).json();
  const frenchProductPage = await (await fetch(`${base}/fr/deal/${franceProducts[0].id}`)).text();
  assert(frenchProductPage.includes("GUIDE D’ACHAT ONEDAILYDROP") && frenchProductPage.includes("À vérifier avant l’achat"), "The French buying brief is not localized");
  assert(frenchProductPage.includes("offres actuelles vérifiées") && frenchProductPage.includes("GTIN validé"), "The French Day 11 offer match is not localized");
  const germanyProducts = await (await get("/api/products?market=de")).json();
  const germanProductPage = await (await fetch(`${base}/de/deal/${germanyProducts[0].id}`)).text();
  assert(germanProductPage.includes("ONEDAILYDROP KAUFÜBERSICHT") && germanProductPage.includes("Vor dem Kauf prüfen"), "The German buying brief is not localized");
  assert(germanProductPage.includes("geprüfte aktuelle Angebote") && germanProductPage.includes("validierte GTIN"), "The German Day 11 offer match is not localized");

  const internalClick = await fetch(`${base}/api/click-events`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      eventId:"internal-click-0001",
      sessionId:"seo-session-000001",
      productId:products[0].id,
      sourcePage:"search",
      placement:"catalog_title",
      action:"view_details"
    })
  });
  assert(internalClick.status === 204, "An internal product click was not accepted");

  const baselineEvents = {
    market:"us",
    events:[
      {
        eventId:"search-event-00001",
        sessionId:"seo-session-000001",
        eventType:"search",
        sourcePage:"search",
        query:"product 1",
        resultCount:1
      },
      {
        eventId:"impression-event-01",
        sessionId:"seo-session-000001",
        eventType:"impression",
        sourcePage:"search",
        placement:"catalog_title",
        productId:products[0].id,
        position:1
      }
    ]
  };
  const analyticsEvents = await fetch(`${base}/api/analytics/events`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(baselineEvents)
  });
  assert(analyticsEvents.status === 204, "Search and impression events were not accepted");
  const duplicateAnalyticsEvents = await fetch(`${base}/api/analytics/events`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify(baselineEvents)
  });
  assert(duplicateAnalyticsEvents.status === 204, "Idempotent analytics retry was rejected");
  assert(db.prepare("SELECT COUNT(*) AS total FROM analytics_events").get().total === 2, "Analytics event IDs did not prevent duplicates");

  const retailerClick = await get(`/us/go/${products[0].id}?source=product&placement=product_cta&action=view_deal&sid=seo-session-000001&eid=outbound-click-001`);
  assert(retailerClick.status === 302, "The retailer action did not redirect");
  assert(retailerClick.headers.get("location").includes("campid=5339179772"), "The original affiliate destination was not preserved");

  const shopAllClick = await get(`/us/go/${products[0].id}?source=product&placement=shop_all&action=shop_all`);
  assert(shopAllClick.status === 302, "The retailer shop-all action did not redirect");
  const shopAllLocation = shopAllClick.headers.get("location") || "";
  assert(shopAllLocation.includes("/sch/i.html") && shopAllLocation.includes("campid=5339179772"), "The shop-all link lost retailer attribution");

  const recordedClicks = db.prepare(`
    SELECT event_id,session_id,source_page,placement,action_type,destination_type,retailer_name
    FROM clicks WHERE product_id=? ORDER BY id
  `).all(products[0].id);
  assert(recordedClicks.some(click => click.source_page === "search" && click.action_type === "view_details" && click.destination_type === "internal"), "Internal click dimensions were not stored");
  assert(recordedClicks.some(click => click.event_id === "internal-click-0001" && click.session_id === "seo-session-000001"), "Internal click session attribution is missing");
  assert(recordedClicks.some(click => click.source_page === "product" && click.action_type === "view_deal" && click.destination_type === "retailer"), "Retailer click dimensions were not stored");
  assert(recordedClicks.some(click => click.event_id === "outbound-click-001" && click.session_id === "seo-session-000001"), "Outbound click session attribution is missing");
  assert(recordedClicks.some(click => click.placement === "shop_all" && click.action_type === "shop_all" && click.retailer_name === "eBay"), "Shop-all click dimensions were not stored");

  const analyticsResponse = await fetch(`${base}/api/admin/click-analytics?days=7`, {
    headers:{"x-admin-key":"test-admin-key"}
  });
  const analytics = await analyticsResponse.json();
  assert(analyticsResponse.status === 200, "Admin click analytics is unavailable");
  assert(Number(analytics.totals.internal_product_clicks) === 1, "Internal click analytics total is incorrect");
  assert(Number(analytics.totals.retailer_clicks) === 2, "Retailer click analytics total is incorrect");

  const baselineResponse = await fetch(`${base}/api/admin/analytics-baseline?days=7`, {
    headers:{"x-admin-key":"test-admin-key"}
  });
  const baseline = await baselineResponse.json();
  assert(baselineResponse.status === 200, "Day 5 analytics baseline is unavailable");
  assert(Number(baseline.totals.searches) === 1, "Search baseline total is incorrect");
  assert(Number(baseline.totals.impressions) === 1, "Impression baseline total is incorrect");
  assert(Number(baseline.totals.product_clicks) === 1, "Product-click baseline total is incorrect");
  assert(Number(baseline.totals.outbound_clicks) === 2, "Outbound-click baseline total is incorrect");
  assert(Number(baseline.rates.searches_per_session) === 1, "Searches-per-session baseline is incorrect");
  assert(Number(baseline.rates.result_ctr) === 1, "Result CTR baseline is incorrect");

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
