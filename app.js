// Bluehost cPanel / Phusion Passenger entry point.
// Deployment refresh: homepage anchors and search, July 28, 2026.
// Register catalog mode safeguards and the SEO homepage before src/server adds express.static().
const express = require("express");
const cron = require("node-cron");
const db = require("./src/db");
const config = require("./src/config");
const { localizeProduct } = require("./src/demoTranslations");
const renderHomepage = require("./src/homepage-seo");
const { codes: marketCodes, normalizeMarket, marketFromIp, marketFromRequest, marketPath } = require("./src/markets");
const { resolveLanguage } = require("./src/i18n");
const { sourceSql, isPublicSource } = require("./src/publicCatalog");
const createExpressApp = express;

if (!config.liveRefreshEnabled) {
  cron.schedule = () => ({ start() {}, stop() {}, destroy() {} });
}

if (config.isProduction && !config.demoMode && config.liveRefreshEnabled) {
  setImmediate(() => {
    require("./src/catalogRecovery")(config).catch(error => {
      console.error(`Production catalog recovery error: ${error.message}`);
    });
  });
}

function countProducts(where = "1=1", params = []) {
  return Number(db.prepare(`SELECT COUNT(*) n FROM products WHERE status='published' AND ${where}`).get(...params).n || 0);
}

function catalogStatus(marketCode = "") {
  const marketWhere = marketCode ? "market=? AND " : "";
  const params = marketCode ? [marketCode] : [];
  const latestRun = db.prepare("SELECT provider,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null;
  return {
    siteMode: config.siteMode,
    provider: config.provider,
    requestedProvider: config.requestedProvider,
    liveRefreshEnabled: Boolean(config.liveRefreshEnabled),
    market: marketCode || "all",
    products: countProducts(`${marketWhere}1=1`, params),
    liveProducts: countProducts(`${marketWhere}${sourceSql()}`, params),
    demoProducts: 0,
    automatedCatalogConfigured: config.provider !== "unconfigured",
    affiliateTagConfigured: marketCode ? Boolean(config.affiliateTagForMarket(marketCode)) : Boolean(config.affiliateTagConfigured),
    searchKeywordCount: config.searchKeywords.length,
    lastRun: isPublicSource(latestRun?.provider) ? latestRun : null
  };
}

function expressWithHomepage(...args) {
  const app = createExpressApp(...args);
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, "");
    if (forwardedHost !== "onedailydrop.com") return next();
    return res.redirect(301, `https://www.onedailydrop.com${req.originalUrl || "/"}`);
  });

  app.get("/api/status", (req, res) => {
    const marketCode = normalizeMarket(req.query.market) || marketFromIp(req).code;
    res.json(catalogStatus(marketCode));
  });

  app.get("/api/products", (req, res, next) => {
    if (!config.isProduction) return next();
    const selectedMarket = normalizeMarket(req.query.market) || marketFromIp(req).code;
    const language = resolveLanguage(req, res, selectedMarket);
    const sourceCondition = sourceSql();
    const daily = db.prepare(`
      SELECT p.*,d.rank AS daily_rank,d.selection_reason AS daily_selection_reason
      FROM daily_drops d
      JOIN products p ON p.id=d.product_id
      WHERE d.market=? AND d.drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=?)
        AND ${sourceSql("p")}
      ORDER BY d.rank
    `).all(selectedMarket, selectedMarket);
    const dailyIds = new Set(daily.map(product => product.id));
    const catalog = db.prepare(`
      SELECT * FROM products
      WHERE market=? AND status='published' AND ${sourceCondition}
      ORDER BY score DESC,updated_at DESC
    `).all(selectedMarket).filter(product => !dailyIds.has(product.id));
    const products = [...daily.map(product => ({
      ...product,
      selection_reason: product.daily_selection_reason || product.selection_reason
    })), ...catalog];
    return res.json(products.map(product => localizeProduct(product, language)));
  });

  app.get("/go/:id", (req, res, next) => {
    if (!config.isProduction) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(req.params.id);
    if (!isPublicSource(product?.source)) return res.sendStatus(404);
    return next();
  });

  app.get("/deal/:slug", (req, res, next) => {
    if (!config.isProduction) return next();
    const id = String(req.params.slug).match(/-(\d+)$/)?.[1];
    if (!id) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(id);
    if (!isPublicSource(product?.source)) return res.sendStatus(404);
    return next();
  });

  app.get("/", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.redirect(302, marketPath(marketFromIp(req).code));
  });

  app.get(`/:market(${marketCodes.join("|")})`, (req, res) => {
    req.market = marketFromRequest(req).code;
    return renderHomepage(req, res);
  });

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
