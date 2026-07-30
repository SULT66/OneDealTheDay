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
process.env.SITE_MODE = "demo";
process.env.SUPPORTED_MARKETS = "us";

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
  assert(homepage.includes('class="site-header"'), "Full site header is missing from the empty-catalog homepage");
  assert(homepage.includes('id="today" class="hero"'), "Full homepage hero is missing");
  assert(homepage.includes('id="subscribeForm"'), "Subscription form is missing");
  assert(homepage.includes("The first verified Daily Drop is coming."), "Verified catalog message is missing");
  assert(!homepage.includes("EDITORIAL CATALOG UPDATE"), "Standalone catalog placeholder is still replacing the homepage");
  for (const forbidden of ["Development preview", "Sample price", "Retailer availability coming soon", "Rainforest"]) {
    assert(!homepage.includes(forbidden), `US homepage still exposes ${forbidden}`);
  }

  const spanishResponse = await get("/us?lang=es");
  const spanishHomepage = await spanishResponse.text();
  assert(spanishHomepage.includes('<html lang="es-US">'), "US Spanish locale is incorrect");
  assert(spanishHomepage.includes("La primera oferta diaria verificada está en camino."), "US Spanish catalog message is missing");
  assert(String(spanishResponse.headers.get("set-cookie") || "").includes("odd_lang_us=es"), "US language preference cookie is missing");

  const frenchHomepage = await (await get("/fr")).text();
  assert(frenchHomepage.includes('<html lang="fr-FR">'), "France must default to French");
  assert(frenchHomepage.includes("La première sélection quotidienne vérifiée arrive."), "French catalog message is missing");

  const franceEnglish = await (await get("/fr?lang=en")).text();
  assert(franceEnglish.includes('<html lang="en-FR">'), "France English locale is incorrect");
  assert(franceEnglish.includes("The first verified Daily Drop is coming."), "France English fallback copy is missing");

  const germanHomepage = await (await get("/de")).text();
  assert(germanHomepage.includes('<html lang="de-DE">'), "Germany must default to German");
  assert(germanHomepage.includes("Der erste geprüfte Daily Drop kommt bald."), "German catalog message is missing");

  const canadaHomepage = await (await get("/ca")).text();
  assert(canadaHomepage.includes('<html lang="en-CA">'), "Canada must default to English");

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
  assert(!sitemap.includes("<image:image>"), "Removed product images are still present in sitemap");
  assert(!sitemap.includes("/deal/") && !sitemap.includes("/category/") && !sitemap.includes("/brands"), "Removed catalog pages remain in sitemap");

  const products = await (await get("/api/products?market=us")).json();
  assert(products.length === 0, "Legacy catalog products are still public");

  const status = await (await get("/api/status?market=us")).json();
  assert(status.products === 0, "Catalog status still counts removed products");
  assert(status.provider === "unconfigured", "An unapproved automated provider is enabled");
  assert(status.requestedProvider === "unconfigured", "A legacy provider request is still exposed");
  assert(status.lastRun === null, "Legacy demo refresh history is still exposed");

  const legacyBrands = await get("/brands");
  assert(legacyBrands.status === 301, "Legacy Brands URL must return 301");
  assert(legacyBrands.headers.get("location") === "/us/brands", "Legacy Brands redirect target is incorrect");
  const hiddenBrands = await get("/us/brands");
  const hiddenBrandsPage = await hiddenBrands.text();
  assert(hiddenBrands.status === 404, "Empty Brands page must be hidden");
  assert(hiddenBrandsPage.includes('<meta name="robots" content="noindex,nofollow">'), "Hidden Brands page must be noindex");
  assert(!sitemap.includes("<loc>https://www.onedailydrop.com/us/brands</loc>"), "Empty Brands page must not appear in sitemap");

  const searchPage = await (await get("/us/search?q=plug")).text();
  assert(searchPage.includes("No deals matched"), "Empty search page is not honest");

  const missingResponse = await get("/us/deal/not-a-real-product-999999");
  const missingPage = await missingResponse.text();
  assert(missingResponse.status === 404, "Missing product must return HTTP 404");
  assert(missingPage.includes('<meta name="robots" content="noindex,nofollow">'), "404 page must be noindex");

  const trustPage = await (await get("/us/about")).text();
  assert(trustPage.includes('property="og:title" content="About | OneDailyDrop"'), "Trust page Open Graph metadata is missing");
  assert(trustPage.includes('"@type":"WebPage"'), "Trust page schema is missing");

  console.log("Empty-catalog SEO route validation passed");
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
