const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const hasLiquidGlass = source => /\/liquid-glass\.css\?v=[^"'`\s>]+/.test(source);
const files = [
  "app.js",
  "src/config.js",
  "src/publicCatalog.js",
  "src/markets.js",
  "src/ranker.js",
  "src/refresh.js",
  "src/catalogRecovery.js",
  "src/providers/demo.js",
  "src/providers/ebay.js",
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
if (!app.includes("sourceSql()") || !app.includes("isPublicSource")) throw new Error("Approved-source catalog filters are missing");
if (app.includes("preview catalog seeded") || app.includes('provider: "demo"')) {
  throw new Error("Demo catalog seeding is still enabled");
}
if (app.includes("function unavailablePage") || app.includes("status.liveProducts === 0")) {
  throw new Error("The empty catalog still replaces the full homepage with a standalone placeholder");
}
if (!app.includes("return renderHomepage(req, res);")) {
  throw new Error("Country routes do not render the full homepage");
}
if (!app.includes('forwardedHost === "onedailydrop.com"') || !app.includes("CANONICAL_HOST") || !app.includes("res.redirect(301")) {
  throw new Error("The apex domain is not permanently redirected to the canonical www host");
}
for (const required of ["AZURE_PRODUCTION_HOST", "normalizedMarketPath", "normalizedPath", "insecureCanonicalRequest"]) {
  if (!app.includes(required)) throw new Error(`Canonical URL normalization is missing: ${required}`);
}

const homepage = fs.readFileSync(path.join(root, "src/homepage.js"), "utf8");
for (const forbidden of ["DEMO PREVIEW", "Sample price", "VIEW PRODUCT PREVIEW", "Development preview", "no API credits are being used"]) {
  if (homepage.includes(forbidden)) throw new Error(`Public homepage still exposes internal catalog wording: ${forbidden}`);
}
if (homepage.includes('content="noindex')) {
  throw new Error("Country homepages must remain indexable in demo and live modes");
}
if (!homepage.includes('<meta name="robots" content="index,follow,max-image-preview:large">')) {
  throw new Error("Country homepages are missing the required indexable robots directive");
}
for (const required of ['<link rel="canonical" href="${canonical}">', 'property="og:site_name"', 'name="twitter:title"', '"@type": "WebPage"', '"@type": "SearchAction"']) {
  if (!homepage.includes(required)) throw new Error(`Homepage SEO metadata is missing: ${required}`);
}
if (homepage.includes("shortTitle")) throw new Error("Homepage titles are still truncated");
if (!hasLiquidGlass(homepage)) {
  throw new Error("Server-rendered homepage is missing the Liquid Glass design system");
}
if (!homepage.includes("const featured = dailyProducts[0] || null;")) {
  throw new Error("Homepage is missing its single Today's Drop selection");
}
for (const required of ["catalog-empty-featured", "home.catalogTitle", "DEFAULT_INTEREST_CATEGORIES"]) {
  if (!homepage.includes(required)) throw new Error(`Homepage empty-catalog design is missing: ${required}`);
}
if (!homepage.includes("const moreWorthSeeing = dailyProducts.slice(1, 10);")) {
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
if (!browserApp.includes('activeCategory === "More Worth Seeing"') || !browserApp.includes('? ""')) {
  throw new Error("The nine-pick section still shows an unnecessary product count");
}
if (!browserApp.includes("VIEW DEAL AT") || !browserApp.includes("offer-facts") || !browserApp.includes("PRICE HISTORY")) {
  throw new Error("Client-side live offer details are incomplete");
}
if (!browserApp.includes('classList.toggle("is-open", willOpen)') || !browserApp.includes('willOpen ? tr("menu.close"')) {
  throw new Error("Homepage hamburger behavior is missing");
}
for (const required of ["catalog-empty-featured", "home.catalogSectionEmpty", "home.catalogArchiveEmpty"]) {
  if (!browserApp.includes(required)) throw new Error(`Client empty-catalog rendering is missing: ${required}`);
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
for (const required of [".mobile-menu-toggle", ".main-nav.is-open", "overflow-x:hidden!important", "grid-template-columns:1fr!important"]) {
  if (!styles.includes(required)) throw new Error(`Mobile vertical navigation style is missing: ${required}`);
}

const database = fs.readFileSync(path.join(root, "src/db.js"), "utf8");
if (!database.includes("CREATE TABLE IF NOT EXISTS subscribers")) throw new Error("Subscriber storage is missing");
if (!database.includes("CREATE TABLE IF NOT EXISTS daily_drops")) throw new Error("Permanent daily-drop archive storage is missing");
if (!database.includes("IN ('demo','amazon-manual')")) {
  throw new Error("Retired demo and manual Amazon products are not purged safely at startup");
}
if (database.includes("installManualCatalog") || fs.existsSync(path.join(root, "src", "manualCatalog.js"))) {
  throw new Error("The retired manual Amazon catalog can still be installed");
}
const publicCatalog = fs.readFileSync(path.join(root, "src/publicCatalog.js"), "utf8");
if (publicCatalog.includes('"amazon-manual"')) {
  throw new Error("Manual Amazon products remain eligible for public pages");
}
for (const field of ["market", "score_breakdown", "selection_reason", "provider_external_id"]) {
  if (!database.includes(field)) throw new Error(`Market-aware product selection field is missing from the database: ${field}`);
}
if (!database.includes("score_model")) throw new Error("Daily-drop snapshots do not preserve the scoring model version");
for (const field of ["retailer_name", "seller_name", "seller_rating", "seller_feedback_count", "shipping_summary", "return_summary", "availability", "checked_at"]) {
  if (!database.includes(field)) throw new Error(`Live offer field is missing from the database: ${field}`);
}
const refresh = fs.readFileSync(path.join(root, "src/refresh.js"), "utf8");
for (const field of ["@retailer_name", "@seller_name", "@seller_rating", "@seller_feedback_count", "@shipping_summary", "@return_summary", "@availability", "@checked_at"]) {
  if (!refresh.includes(field)) throw new Error(`Live offer field is not persisted during refresh: ${field}`);
}
for (const required of ["selectDailyProducts", "INSERT INTO daily_drops", "minimumScore: config.provider === \"demo\" ? 0 : 60", "preserveDailySelection", "existingSnapshots"]) {
  if (!refresh.includes(required)) throw new Error(`Daily country selection workflow is missing: ${required}`);
}
const ranker = fs.readFileSync(path.join(root, "src/ranker.js"), "utf8");
for (const required of ["price_quality", "product_quality", "review_confidence", "seller_reliability", "demand_usefulness", "shipping_returns"]) {
  if (!ranker.includes(required)) throw new Error(`OneDailyDrop Score component is missing: ${required}`);
}
for (const required of ["current-offer-v2", "comparable_median_price", "return referenceScore", "return (knownRetailer ? 6 : 0)", "return rankPoints + reviewDemand + badge", "const shippingPoints = shipping ? 4 : 2"]) {
  if (!ranker.includes(required)) throw new Error(`OneDailyDrop Score weighting is incomplete: ${required}`);
}
for (const forbidden of ["average_30_day_price", "average_90_day_price", "price_history_observation_count", "evidencePenalty"]) {
  if (ranker.includes(forbidden)) throw new Error(`Public OneDailyDrop Score still depends on unavailable evidence: ${forbidden}`);
}
if (!ranker.includes("result.total < number(options.minimumScore, 60)")) {
  throw new Error("Live products below the minimum OneDailyDrop Score are not excluded");
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
for (const required of ["daily_drops", '"page.archiveDescription"', "xhtml:link", "timezone:selectedMarket.timezone", "market:selectedMarket.code"]) {
  if (!server.includes(required)) throw new Error(`Country archive or local SEO behavior is missing: ${required}`);
}
for (const required of ['xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"', "<image:image>", "Disallow: /go/", 'html lang="${esc(locale)}"', '"page.customerRating"', '"@id":`${canonical}#product`', "sendNotFound"]) {
  if (!server.includes(required)) throw new Error(`Technical SEO behavior is missing: ${required}`);
}
for (const required of [
  'const canonical = `${SITE}${marketPath(selectedMarket.code, route)}`',
  'language === defaultLanguages[selectedMarket.code]',
  'url:canonical,priceCurrency',
  "brandMarkets",
  "brandsMarkets",
  'fetchpriority="high"',
  'loading="lazy" decoding="async"'
]) {
  if (!server.includes(required)) throw new Error(`Stage 5 technical SEO safeguard is missing: ${required}`);
}
if (server.includes('res.status(404).send("Product not found")') || server.includes('res.status(404).send("Category not found")')) {
  throw new Error("A crawlable plain-text 404 response remains in a public SEO route");
}
if (!server.includes('"/about.html": "/about"') || !server.includes('"/contact.html": "/contact"')) {
  throw new Error("Legacy HTML title URLs are not redirected to their canonical pages");
}
if (server.includes('data-account-nav href="/account"')) {
  throw new Error("Sign In is still exposed in the public site header");
}
if (!server.includes('aria-controls="mainNavigation"') || !server.includes('id="mainNavigation"')) {
  throw new Error("Shared pages are missing the accessible mobile menu controls");
}
for (const required of ['id="price-history"', "retailer-detail-grid", '"product.viewDealAt"']) {
  if (!server.includes(required)) throw new Error(`Product deal page is missing: ${required}`);
}
const homepageSeo = fs.readFileSync(path.join(root, "src/homepage-seo.js"), "utf8");
const i18n = fs.readFileSync(path.join(root, "src/i18n.js"), "utf8");
for (const required of ['us: ["en", "es"]', 'ca: ["en", "fr"]', 'fr: ["fr", "en"]', 'de: ["de", "en"]', "resolveLanguage", "languageSwitcher"]) {
  if (!i18n.includes(required)) throw new Error(`Localization behavior is missing: ${required}`);
}
if (!i18n.includes("OneDailyDrop does not sell products.")) {
  throw new Error("The homepage does not explain the retailer handoff");
}
if (!homepageSeo.includes('/<section class="confidence-section">[\\s\\S]*?<\\/section>/')) {
  throw new Error("The repeated trust/score explanation is not removed");
}
for (const required of ["marketFromRequest", "alternateLinks", "window.__ODD_MARKET__", "noindex,follow", "imageConnectionHints"]) {
  if (!homepageSeo.includes(required)) throw new Error(`Country homepage SEO behavior is missing: ${required}`);
}
if (!i18n.includes("selected automatically from your IP location")) {
  throw new Error("Country homepage location explanation is missing");
}
const markets = require(path.join(root, "src", "markets"));
if (markets.marketFromIp({ headers: { "x-forwarded-for": "2.0.0.1" } }).code !== "fr") {
  throw new Error("A French visitor IP does not resolve to the France market");
}
if (markets.normalizeMarket("fra") !== "fr" || markets.marketPath("fr", "/search") !== "/fr/search") {
  throw new Error("Country aliases or localized paths are invalid");
}
const filteredAlternates = markets.alternateLinks("/category/test", ["us", "uk"]);
if (!filteredAlternates.includes('hreflang="en-US"') || !filteredAlternates.includes('hreflang="en-GB"') || filteredAlternates.includes('hreflang="fr"')) {
  throw new Error("Filtered category hreflang output is invalid");
}
if (markets.codes.join(",") !== "us,ca,uk,fr,de") {
  throw new Error(`Unexpected supported country list: ${markets.codes.join(",")}`);
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

const legacyDemoEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  SITE_MODE: "demo",
  PRODUCT_PROVIDER: "multi",
  LIVE_REFRESH_ENABLED: "true",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key",
  SEARCH_KEYWORDS: ""
};
const legacyDemoResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: legacyDemoEnv, encoding: "utf8" });
if (legacyDemoResult.status !== 0) throw new Error(legacyDemoResult.stderr || "Legacy demo config probe failed");
const legacyDemo = JSON.parse(legacyDemoResult.stdout);
if (legacyDemo.provider !== "unconfigured" || legacyDemo.demoMode || legacyDemo.liveRefreshEnabled) {
  throw new Error(`Legacy settings can still reactivate an unapproved provider: ${legacyDemoResult.stdout}`);
}
if (legacyDemo.keywords < 5) throw new Error("Default Amazon search categories are missing");

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
if (live.provider !== "unconfigured" || live.demoMode || live.liveRefreshEnabled) {
  throw new Error(`Unapproved provider activation is still possible: ${liveResult.stdout}`);
}

const ebayEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  EBAY_CLIENT_ID: "production-client-id",
  EBAY_CLIENT_SECRET: "production-client-secret",
  EBAY_CAMPAIGN_ID: "5339179772"
};
const ebayResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: ebayEnv, encoding: "utf8" });
if (ebayResult.status !== 0) throw new Error(ebayResult.stderr || "eBay config probe failed");
const ebay = JSON.parse(ebayResult.stdout);
if (ebay.provider !== "ebay" || ebay.demoMode || !ebay.liveRefreshEnabled) {
  throw new Error(`Approved eBay provider did not activate safely: ${ebayResult.stdout}`);
}

console.log("Verified-source catalog, empty-state homepage and trust-page validation passed.");
