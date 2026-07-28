const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

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
  assert(homepage.includes('hreflang="en-US"'), "US homepage hreflang is missing");
  assert(homepage.includes('"@type":"WebPage"'), "Homepage WebPage schema is missing");
  assert(homepage.includes('property="og:site_name" content="OneDailyDrop"'), "Homepage Open Graph metadata is missing");

  const robots = await (await get("/robots.txt")).text();
  assert(robots.includes("Disallow: /go/"), "Affiliate redirect paths are not blocked in robots.txt");
  assert(robots.includes("Sitemap: https://www.onedailydrop.com/sitemap.xml"), "Sitemap declaration is missing");

  const sitemap = await (await get("/sitemap.xml")).text();
  assert(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), "Image sitemap namespace is missing");
  assert(sitemap.includes("<image:image>"), "Product images are missing from sitemap");

  const products = await (await get("/api/products?market=us")).json();
  assert(products.length > 0, "SEO route test has no products");
  const productUrl = products[0].deal_url;
  const productPage = await (await get(productUrl)).text();
  assert(productPage.includes('property="og:type" content="product"'), "Product Open Graph type is missing");
  assert(productPage.includes('"@type":"Product"'), "Product schema is missing");
  assert(productPage.includes("Customer rating"), "Structured product rating is not visible on the page");
  assert(productPage.includes('<meta name="robots" content="index,follow,max-image-preview:large">'), "Product page is not indexable");

  const categoryUrl = products[0].category_url;
  const categoryPage = await (await get(categoryUrl)).text();
  assert(categoryPage.includes("How we select"), "Category SEO content is missing");
  assert(categoryPage.includes("Current price range"), "Category price summary is missing");
  assert(!categoryPage.includes('hreflang="en-FR"'), "Category hreflang points to a market without this page");

  const searchPage = await (await get("/us/search?q=plug")).text();
  assert(searchPage.includes('<meta name="robots" content="noindex,follow">'), "Search result pages must be noindex");

  const missingResponse = await get("/us/deal/not-a-real-product-999999");
  const missingPage = await missingResponse.text();
  assert(missingResponse.status === 404, "Missing product must return HTTP 404");
  assert(missingPage.includes('<meta name="robots" content="noindex,nofollow">'), "404 page must be noindex");

  const trustPage = await (await get("/about")).text();
  assert(trustPage.includes('property="og:title" content="About | OneDailyDrop"'), "Trust page Open Graph metadata is missing");
  assert(trustPage.includes('"@type":"WebPage"'), "Trust page schema is missing");

  console.log("SEO route validation passed");
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
