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
  assert(homepage.includes('hreflang="en-US"'), "US homepage hreflang is missing");
  assert(homepage.includes('"@type":"WebPage"'), "Homepage WebPage schema is missing");
  assert(homepage.includes('property="og:site_name" content="OneDailyDrop"'), "Homepage Open Graph metadata is missing");
  assert(homepage.includes('<option value="es">Español</option>'), "US Spanish language switch is missing");
  const usLanguageSwitcher = homepage.match(/<form class="language-switcher"[\s\S]*?<\/form>/)?.[0] || "";
  assert(usLanguageSwitcher.includes('<option value="en" selected>English</option>'), "US English language option is missing");
  assert(!usLanguageSwitcher.includes("Deutsch") && !usLanguageSwitcher.includes("Français"), "US must only offer English and Spanish");
  assert(homepage.includes('class="country-switcher"'), "Country switcher is missing");
  assert(homepage.includes('<option value="/fr">🇫🇷 France</option>'), "France is missing from the country switcher");

  const spanishResponse = await get("/us?lang=es");
  const spanishHomepage = await spanishResponse.text();
  assert(spanishHomepage.includes('<html lang="es-US">'), "US Spanish locale is incorrect");
  assert(spanishHomepage.includes("Míralo aquí"), "US Spanish homepage copy is missing");
  assert(String(spanishResponse.headers.get("set-cookie") || "").includes("odd_lang_us=es"), "US language preference cookie is missing");
  assert(spanishHomepage.includes('<option value="/de">🇩🇪 Germany</option>'), "Country names must stay recognizable when Spanish is selected");
  assert(!spanishHomepage.includes(">Alemania<"), "Country switcher must not look like an extra language list");

  const frenchHomepage = await (await get("/fr")).text();
  assert(frenchHomepage.includes('<html lang="fr-FR">'), "France must default to French");
  assert(frenchHomepage.includes("Vérifiez ici"), "French homepage copy is missing");
  const frenchLanguageSwitcher = frenchHomepage.match(/<form class="language-switcher"[\s\S]*?<\/form>/)?.[0] || "";
  assert(frenchLanguageSwitcher.includes('<option value="fr" selected>Français</option>'), "France French language option is missing");
  assert(frenchLanguageSwitcher.includes('<option value="en">English</option>'), "France English language option is missing");
  assert(!frenchLanguageSwitcher.includes("Deutsch") && !frenchLanguageSwitcher.includes("Español"), "France must only offer French and English");
  assert(frenchHomepage.includes('<option value="en">English</option>'), "France English switch is missing");
  assert(require("../src/i18n").categoryLabel("Smart Home", "fr") === "Maison connectée", "French Smart Home category translation is incorrect");

  const franceEnglish = await (await get("/fr?lang=en")).text();
  assert(franceEnglish.includes('<html lang="en-FR">'), "France English locale is incorrect");
  assert(franceEnglish.includes("Check here"), "France English fallback copy is missing");

  const germanHomepage = await (await get("/de")).text();
  assert(germanHomepage.includes('<html lang="de-DE">'), "Germany must default to German");
  assert(germanHomepage.includes("Hier prüfen"), "German homepage copy is missing");
  const germanLanguageSwitcher = germanHomepage.match(/<form class="language-switcher"[\s\S]*?<\/form>/)?.[0] || "";
  assert(germanLanguageSwitcher.includes('<option value="de" selected>Deutsch</option>'), "Germany German language option is missing");
  assert(germanLanguageSwitcher.includes('<option value="en">English</option>'), "Germany English language option is missing");
  assert(!germanLanguageSwitcher.includes("Español") && !germanLanguageSwitcher.includes("Français"), "Germany must only offer German and English");

  const canadaHomepage = await (await get("/ca")).text();
  assert(canadaHomepage.includes('<html lang="en-CA">'), "Canada must default to English");
  assert(canadaHomepage.includes('<option value="fr">Français</option>'), "Canada French switch is missing");

  const ukHomepage = await (await get("/uk")).text();
  assert(!ukHomepage.includes('class="language-switcher"'), "UK should not show a one-option language switch");

  const legacyAbout = await get("/about");
  assert(legacyAbout.status === 301, "Legacy unprefixed pages must redirect permanently");
  assert(legacyAbout.headers.get("location") === "/us/about", "Legacy page redirect target is incorrect");

  const robots = await (await get("/robots.txt")).text();
  assert(robots.includes("Disallow: /go/"), "Affiliate redirect paths are not blocked in robots.txt");
  assert(robots.includes("Sitemap: https://www.onedailydrop.com/sitemap.xml"), "Sitemap declaration is missing");

  const sitemap = await (await get("/sitemap.xml")).text();
  assert(sitemap.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'), "Image sitemap namespace is missing");
  assert(sitemap.includes("<image:image>"), "Product images are missing from sitemap");

  const products = await (await get("/api/products?market=us")).json();
  assert(products.length > 0, "SEO route test has no products");
  const smartPlug = products.find(product => String(product.provider_external_id || product.external_id || "").endsWith("D003"));
  assert(smartPlug, "Localized demo product fixture is missing");

  const spanishProducts = await (await get("/api/products?market=us&lang=es")).json();
  const spanishSmartPlug = spanishProducts.find(product => String(product.provider_external_id || product.external_id || "").endsWith("D003"));
  assert(spanishSmartPlug?.title.includes("enchufes inteligentes"), "Spanish product title is not localized");
  assert(spanishSmartPlug?.description.includes("controlar lámparas"), "Spanish product description is not localized");
  assert(spanishSmartPlug?.deal_url === smartPlug.deal_url, "Localized product title changed the canonical deal URL");

  const spanishProductPage = await (await get(`${smartPlug.deal_url}?lang=es`)).text();
  assert(spanishProductPage.includes("enchufes inteligentes"), "Spanish product page title is not localized");
  assert(spanishProductPage.includes("Hogar inteligente"), "Spanish product category is not localized");
  assert(spanishProductPage.includes("reseñas"), "Spanish review label is not localized");
  for (const englishFragment of [">Why we picked it<", ">Current price<", ">Customer rating<", ">Price history<", ">Home<", ">View details<"]) {
    assert(!spanishProductPage.includes(englishFragment), `Spanish product page still contains ${englishFragment}`);
  }

  const spanishCategoryPage = await (await get(`${smartPlug.category_url}?lang=es`)).text();
  assert(spanishCategoryPage.includes("Mejores ofertas de Hogar inteligente"), "Spanish category heading is not localized");
  assert(spanishCategoryPage.includes("Cómo seleccionamos ofertas de hogar inteligente"), "Spanish category method is not localized");

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
  assert(!categoryPage.includes('hreflang="fr-FR"'), "Category hreflang points to a market without this page");

  const legacyCategory = await get(categoryUrl.replace(/^\/us/, ""));
  assert(legacyCategory.status === 301, "Legacy category URL must return 301");
  assert(legacyCategory.headers.get("location") === categoryUrl, "Legacy category redirect target is incorrect");

  const legacyProduct = await get(productUrl.replace(/^\/us/, ""));
  assert(legacyProduct.status === 301, "Legacy product URL must return 301");
  assert(legacyProduct.headers.get("location") === productUrl, "Legacy product redirect target is incorrect");

  const legacyBrands = await get("/brands");
  assert(legacyBrands.status === 301, "Legacy Brands URL must return 301");
  assert(legacyBrands.headers.get("location") === "/us/brands", "Legacy Brands redirect target is incorrect");
  const hiddenBrands = await get("/us/brands");
  const hiddenBrandsPage = await hiddenBrands.text();
  assert(hiddenBrands.status === 404, "Empty Brands page must be hidden");
  assert(hiddenBrandsPage.includes('<meta name="robots" content="noindex,nofollow">'), "Hidden Brands page must be noindex");
  assert(!sitemap.includes("<loc>https://www.onedailydrop.com/us/brands</loc>"), "Empty Brands page must not appear in sitemap");

  const searchPage = await (await get("/us/search?q=plug")).text();
  assert(searchPage.includes('<meta name="robots" content="noindex,follow">'), "Search result pages must be noindex");

  const missingResponse = await get("/us/deal/not-a-real-product-999999");
  const missingPage = await missingResponse.text();
  assert(missingResponse.status === 404, "Missing product must return HTTP 404");
  assert(missingPage.includes('<meta name="robots" content="noindex,nofollow">'), "404 page must be noindex");

  const trustPage = await (await get("/us/about")).text();
  assert(trustPage.includes('property="og:title" content="About | OneDailyDrop"'), "Trust page Open Graph metadata is missing");
  assert(trustPage.includes('"@type":"WebPage"'), "Trust page schema is missing");

  console.log("SEO route validation passed");
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
