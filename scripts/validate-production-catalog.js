const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = [
  "app.js",
  "src/config.js",
  "src/refresh.js",
  "src/catalogRecovery.js",
  "src/providers/demo.js",
  "src/homepage.js",
  "src/homepage-seo.js",
  "public/app.js"
];

for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  new vm.Script(source, { filename: relative });
}

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
if (!app.includes("config.demoMode")) throw new Error("Demo-mode routing guard is missing");
if (!app.includes("config.liveRefreshEnabled")) throw new Error("Live refresh guard is missing");
if (!app.includes("cron.schedule = ()")) throw new Error("Scheduled refreshes are not disabled in demo mode");
if (!app.includes("LOWER(COALESCE(source,''))='demo'")) throw new Error("Demo-only API filter is missing");

const homepage = fs.readFileSync(path.join(root, "src/homepage.js"), "utf8");
for (const forbidden of ["DEMO PREVIEW", "Sample price", "VIEW PRODUCT PREVIEW", "Development preview", "no API credits are being used"]) {
  if (homepage.includes(forbidden)) throw new Error(`Public homepage still exposes internal catalog wording: ${forbidden}`);
}
if (homepage.includes("shortTitle")) throw new Error("Homepage titles are still truncated");

const browserApp = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
if (browserApp.includes("shortTitle")) throw new Error("Client-side titles are still truncated");
if (!browserApp.includes('searchParams.delete("country")')) throw new Error("Stale country parameter cleanup is missing");

const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
if (!styles.includes("margin-top:auto")) throw new Error("Card action alignment is missing");
if (!styles.includes("overflow-wrap:anywhere")) throw new Error("Long product title wrapping is missing");
if (!styles.includes(".habit-section")) throw new Error("Daily return habit section styles are missing");

const database = fs.readFileSync(path.join(root, "src/db.js"), "utf8");
if (!database.includes("CREATE TABLE IF NOT EXISTS subscribers")) throw new Error("Subscriber storage is missing");
const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
if (!server.includes('app.post("/api/subscribe"')) throw new Error("Subscriber API is missing");
for (const required of ["Check here", "MAKE IT YOUR DAILY CHECK", "THE ONEDAILYDROP SCORE", "PAST DAILY PICKS"]) {
  if (!homepage.includes(required)) throw new Error(`Habit-building homepage content is missing: ${required}`);
}

const trustPages = [
  "about.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "affiliate-disclosure.html",
  "editorial-policy.html",
  "how-we-select-deals.html",
  "price-disclaimer.html"
];
const footerLinks = [
  'href="/"',
  'href="/about"',
  'href="/contact"',
  'href="/privacy"',
  'href="/terms"',
  'href="/affiliate-disclosure"',
  'href="/editorial-policy"',
  'href="/how-we-select-deals"',
  'href="/price-disclaimer"'
];
for (const file of trustPages) {
  const html = fs.readFileSync(path.join(root, "public", "pages", file), "utf8");
  if (!html.includes('<nav class="footer-links" aria-label="Footer navigation">')) {
    throw new Error(`Accessible footer navigation is missing from ${file}`);
  }
  for (const link of footerLinks) {
    if (!html.includes(link)) throw new Error(`Footer link ${link} is missing from ${file}`);
  }
}
const trustStyles = fs.readFileSync(path.join(root, "public", "trust.css"), "utf8");
if (!trustStyles.includes("flex-wrap:wrap")) throw new Error("Trust-page footer links cannot wrap");
if (!trustStyles.includes("row-gap:12px")) throw new Error("Trust-page footer row spacing is missing");

const demoProbe = `
  require('./src/providers/demo').searchProducts({}).then(products => {
    process.stdout.write(JSON.stringify({
      count: products.length,
      sources: [...new Set(products.map(product => product.source))],
      externalLinks: products.filter(product => /^https?:/i.test(product.affiliate_url || '')).length
    }));
  });
`;
const demoCatalogResult = spawnSync(process.execPath, ["-e", demoProbe], { cwd: root, encoding: "utf8" });
if (demoCatalogResult.status !== 0) throw new Error(demoCatalogResult.stderr || "Demo catalog probe failed");
const demoCatalog = JSON.parse(demoCatalogResult.stdout);
if (demoCatalog.count < 24) throw new Error(`Preview catalog is too small: ${demoCatalog.count}`);
if (demoCatalog.sources.length !== 1 || demoCatalog.sources[0] !== "demo") throw new Error("Preview catalog contains a live retailer source");
if (demoCatalog.externalLinks !== 0) throw new Error("Preview catalog contains external retailer links");

const configProbe = `
  const c = require('./src/config');
  process.stdout.write(JSON.stringify({
    provider: c.provider,
    siteMode: c.siteMode,
    demoMode: c.demoMode,
    liveRefreshEnabled: c.liveRefreshEnabled,
    keywords: c.searchKeywords.length
  }));
`;

const demoEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  SITE_MODE: "demo",
  PRODUCT_PROVIDER: "multi",
  LIVE_REFRESH_ENABLED: "true",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key",
  SEARCH_KEYWORDS: ""
};
const demoResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: demoEnv, encoding: "utf8" });
if (demoResult.status !== 0) throw new Error(demoResult.stderr || "Demo config probe failed");
const demo = JSON.parse(demoResult.stdout);
if (demo.provider !== "demo" || !demo.demoMode || demo.liveRefreshEnabled) {
  throw new Error(`Demo mode could spend retailer credits: ${demoResult.stdout}`);
}
if (demo.keywords < 5) throw new Error("Default demo categories are missing");

const liveEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  SITE_MODE: "live",
  PRODUCT_PROVIDER: "auto",
  LIVE_REFRESH_ENABLED: "true",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key"
};
const liveResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: liveEnv, encoding: "utf8" });
if (liveResult.status !== 0) throw new Error(liveResult.stderr || "Live config probe failed");
const live = JSON.parse(liveResult.stdout);
if (live.provider !== "multi" || live.demoMode || !live.liveRefreshEnabled) {
  throw new Error(`Live mode activation is invalid: ${liveResult.stdout}`);
}

console.log("Catalog, homepage demo and trust-page footer validation passed.");
