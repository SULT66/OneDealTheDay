const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const hasLiquidGlass = source => /\/liquid-glass\.css\?v=[^"'`\s>]+/.test(source);
const files = [
  "app.js",
  "src/config.js",
  "src/refresh.js",
  "src/catalogRecovery.js",
  "src/providers/demo.js",
  "src/homepage.js",
  "src/homepage-seo.js",
  "src/mailer.js",
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
if (!hasLiquidGlass(homepage)) {
  throw new Error("Server-rendered homepage is missing the Liquid Glass design system");
}
if (!homepage.includes("const featured = products[0] || null;")) {
  throw new Error("Homepage is missing its single Today's Drop selection");
}
if (!homepage.includes("const moreWorthSeeing = products.slice(1, 10);")) {
  throw new Error("Homepage does not exclude Today's Drop from the nine additional products");
}
if (!homepage.includes("9 More Worth Seeing")) {
  throw new Error("Homepage is missing the 9 More Worth Seeing section");
}
if ((homepage.match(/id="subscribeForm"/g) || []).length !== 1) {
  throw new Error("Homepage must contain exactly one Daily Drop subscription form");
}
if (!homepage.includes("VIEW DEAL AT") || homepage.includes("SEE DEAL ON")) {
  throw new Error("Homepage retailer actions are not using the final View Deal wording");
}
if (!homepage.includes("offer-facts") || !homepage.includes("price-history-link")) {
  throw new Error("Homepage live offer details or price-history links are missing");
}

const browserApp = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
if (browserApp.includes("shortTitle")) throw new Error("Client-side titles are still truncated");
if (!browserApp.includes('searchParams.delete("country")')) throw new Error("Stale country parameter cleanup is missing");
if (!browserApp.includes("return products.slice(1, 10);")) {
  throw new Error("Client-side rendering still repeats Today's Drop in the additional list");
}
if (browserApp.includes("Top 10 Drops Today")) {
  throw new Error("Client-side rendering still labels the additional products as Top 10");
}
if (browserApp.includes("Club $2.99") || browserApp.includes('clubLink.href = "/club"')) {
  throw new Error("Club is still promoted in the main navigation");
}
if (browserApp.includes('return "DAILY PICK"')) {
  throw new Error("Additional demo cards still use the Daily Pick badge");
}
if (!browserApp.includes('activeCategory === "More Worth Seeing" ? ""')) {
  throw new Error("The nine-pick section still shows an unnecessary product count");
}
if (!browserApp.includes("VIEW DEAL AT") || !browserApp.includes("offer-facts") || !browserApp.includes("PRICE HISTORY")) {
  throw new Error("Client-side live offer details are incomplete");
}

const staticHomepage = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
if (!staticHomepage.includes("9 More Worth Seeing") || staticHomepage.includes("Top 10 Drops Today")) {
  throw new Error("Static homepage fallback is not aligned with the 1 + 9 product structure");
}
if (staticHomepage.includes("Join Club · $2.99")) {
  throw new Error("Static homepage still promotes the Club price");
}

const demoEditorial = require(path.join(root, "src", "demoEditorial"));
if (Object.keys(demoEditorial.reasons).length !== 24 || new Set(Object.values(demoEditorial.reasons)).size !== 24) {
  throw new Error("Demo products do not have 24 unique editorial reasons");
}
for (const forbidden of ['if (isDemo(product)) return "DAILY PICK"', "Selected for its practical value and relevance to everyday shoppers."]) {
  if (homepage.includes(forbidden) || browserApp.includes(forbidden)) {
    throw new Error(`Generic demo-card wording is still present: ${forbidden}`);
  }
}

const clubPage = fs.readFileSync(path.join(root, "public", "club.html"), "utf8");
if (!clubPage.includes("CLUB COMING SOON") || !clubPage.includes("clubWaitlistForm") || /\$2\.99/i.test(clubPage)) {
  throw new Error("Club page is not a price-free coming-soon waitlist");
}
const liquidGlassSource = fs.readFileSync(path.join(root, "public", "liquid-glass.css"), "utf8");
if (liquidGlassSource.includes('content: "Club $2.99"')) {
  throw new Error("Responsive styles can still restore the old Club price");
}

const styles = fs.readFileSync(path.join(root, "public/styles.css"), "utf8");
if (!styles.includes("margin-top:auto")) throw new Error("Card action alignment is missing");
if (!styles.includes("overflow-wrap:anywhere")) throw new Error("Long product title wrapping is missing");
if (!styles.includes(".habit-section")) throw new Error("Daily return habit section styles are missing");

const database = fs.readFileSync(path.join(root, "src/db.js"), "utf8");
if (!database.includes("CREATE TABLE IF NOT EXISTS subscribers")) throw new Error("Subscriber storage is missing");
for (const field of ["retailer_name", "seller_name", "shipping_summary", "return_summary", "availability", "checked_at"]) {
  if (!database.includes(field)) throw new Error(`Live offer field is missing from the database: ${field}`);
}
const refresh = fs.readFileSync(path.join(root, "src/refresh.js"), "utf8");
for (const field of ["@retailer_name", "@seller_name", "@shipping_summary", "@return_summary", "@availability", "@checked_at"]) {
  if (!refresh.includes(field)) throw new Error(`Live offer field is not persisted during refresh: ${field}`);
}
const server = fs.readFileSync(path.join(root, "src/server.js"), "utf8");
if (!server.includes('app.post("/api/subscribe"')) throw new Error("Subscriber API is missing");
if (!server.includes("passwordError(password)")) throw new Error("Strong server-side password validation is missing");
if (!server.includes("passwordResetEmail")) throw new Error("Password recovery email delivery is missing");
if (!server.includes('app.get("/club", (req, res) => res.sendFile(path.join(publicDir, "club.html")))')) {
  throw new Error("Public Club waitlist route is missing");
}
if (!server.includes('app.post("/api/club/interest", authRateLimit')) {
  throw new Error("Club waitlist API is missing");
}
if (!server.includes("if (!clubEnrollmentOpen)")) {
  throw new Error("Club checkout is not disabled before launch");
}
if (!hasLiquidGlass(server)) {
  throw new Error("Dynamic product, category and brand pages are missing Liquid Glass");
}
for (const required of ['id="price-history"', "retailer-detail-grid", "View Deal at"]) {
  if (!server.includes(required)) throw new Error(`Product deal page is missing: ${required}`);
}
const homepageSeo = fs.readFileSync(path.join(root, "src/homepage-seo.js"), "utf8");
if (!homepageSeo.includes("OneDailyDrop does not sell products.")) {
  throw new Error("The homepage does not explain the retailer handoff");
}
if (!homepageSeo.includes('/<section class="confidence-section">[\\s\\S]*?<\\/section>/')) {
  throw new Error("The repeated trust/score explanation is not removed");
}
const accountScript = fs.readFileSync(path.join(root, "public/account.js"), "utf8");
if (!accountScript.includes("form.reset()")) throw new Error("Auth fields are not cleared when switching modes");
if (!accountScript.includes("updatePasswordRules")) throw new Error("Password requirements UI is missing");
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
  if (!hasLiquidGlass(html)) {
    throw new Error(`Liquid Glass is missing from ${file}`);
  }
  if (!html.includes('<nav class="footer-links" aria-label="Footer navigation">')) {
    throw new Error(`Accessible footer navigation is missing from ${file}`);
  }
  for (const link of footerLinks) {
    if (!html.includes(link)) throw new Error(`Footer link ${link} is missing from ${file}`);
  }
}
for (const file of ["index.html", "club.html", "account.html", "admin.html"]) {
  const html = fs.readFileSync(path.join(root, "public", file), "utf8");
  if (!hasLiquidGlass(html)) {
    throw new Error(`Liquid Glass is missing from public/${file}`);
  }
}
const liquidGlass = fs.readFileSync(path.join(root, "public", "liquid-glass.css"), "utf8");
for (const selector of [".hero-copy", ".featured-deal", ".card", ".club-plan", ".account-card", ".content-card", ".deal-modal-panel", ".page-footer"]) {
  if (!liquidGlass.includes(selector)) throw new Error(`Liquid Glass coverage is missing ${selector}`);
}
if (!liquidGlass.includes("content: none !important")) throw new Error("Decorative background circles are still enabled");
if (!liquidGlass.includes(".live-card h2") || !liquidGlass.includes(".rules h2")) {
  throw new Error("Club glass-card heading contrast is not protected");
}
if (!liquidGlass.includes("@media (hover: hover) and (pointer: fine)")) {
  throw new Error("Mouse hover highlighting is missing");
}
const trustStyles = fs.readFileSync(path.join(root, "public", "trust.css"), "utf8");
if (!trustStyles.includes("flex-wrap:wrap")) throw new Error("Trust-page footer links cannot wrap");
if (!trustStyles.includes("row-gap:12px")) throw new Error("Trust-page footer row spacing is missing");
for (const selector of [".shopping-model-note", ".offer-facts", ".price-history-link", ".retailer-detail-grid"]) {
  if (!styles.includes(selector)) throw new Error(`Offer UI style is missing: ${selector}`);
}

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
