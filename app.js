// Bluehost cPanel / Phusion Passenger entry point.
// Register catalog mode safeguards and the SEO homepage before src/server adds express.static().
const express = require("express");
const cron = require("node-cron");
const db = require("./src/db");
const config = require("./src/config");
const { refreshProducts } = require("./src/refresh");
const { reasonFor } = require("./src/demoEditorial");
const { localizeProduct } = require("./src/demoTranslations");
const renderHomepage = require("./src/homepage-seo");
const { codes: marketCodes, normalizeMarket, marketFromIp, marketFromRequest, marketPath } = require("./src/markets");
const { resolveLanguage } = require("./src/i18n");
const createExpressApp = express;

if (!config.liveRefreshEnabled) {
  cron.schedule = () => ({ start() {}, stop() {}, destroy() {} });
}

if (config.demoMode) {
  setImmediate(async () => {
    for (const marketCode of config.markets) {
      const demoProducts = Number(db.prepare("SELECT COUNT(*) n FROM products WHERE market=? AND status='published' AND LOWER(COALESCE(source,''))='demo'").get(marketCode).n || 0);
      if (demoProducts >= 24) continue;
      try {
        await refreshProducts({ ...config, provider: "demo" }, { market: marketCode });
        console.log(`${marketCode.toUpperCase()} preview catalog seeded without retailer API calls.`);
      } catch (error) {
        console.error(`${marketCode.toUpperCase()} preview catalog seed error: ${error.message}`);
      }
    }
  });
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
  return {
    siteMode: config.siteMode,
    provider: config.provider,
    requestedProvider: config.requestedProvider,
    liveRefreshEnabled: Boolean(config.liveRefreshEnabled),
    market: marketCode || "all",
    products: countProducts(`${marketWhere}1=1`, params),
    liveProducts: countProducts(`${marketWhere}LOWER(COALESCE(source,''))<>'demo'`, params),
    demoProducts: countProducts(`${marketWhere}LOWER(COALESCE(source,''))='demo'`, params),
    amazonApiConfigured: Boolean(config.rainforestApiKey),
    walmartApiConfigured: Boolean(config.bluecartApiKey),
    affiliateTagConfigured: marketCode ? Boolean(config.affiliateTagForMarket(marketCode)) : Boolean(config.affiliateTagConfigured),
    searchKeywordCount: config.searchKeywords.length,
    lastRun: db.prepare("SELECT provider,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null
  };
}

function unavailablePage(status) {
  const detail = status.lastRun?.message || (
    !status.amazonApiConfigured && !status.walmartApiConfigured
      ? "Live retailer API keys are not configured in Azure App Settings."
      : "The live retailer feeds did not return a usable catalog."
  );
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalog refresh in progress | OneDailyDrop</title><meta name="robots" content="noindex"><style>body{margin:0;font-family:Arial,sans-serif;background:#f5f6f8;color:#17191c}.wrap{max-width:760px;margin:12vh auto;padding:32px}.brand{font-weight:800;font-size:24px}.mark{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#ff6b00;color:white;margin-right:12px}.card{margin-top:34px;background:white;border:1px solid #e2e5e9;border-radius:24px;padding:42px;box-shadow:0 18px 55px rgba(0,0,0,.08)}h1{font-size:42px;margin:0 0 16px}p{font-size:18px;line-height:1.6;color:#66707d}.note{margin-top:24px;padding:16px 18px;border-radius:14px;background:#fff3eb;color:#8a3c00;font-size:14px}.refresh{display:inline-block;margin-top:24px;padding:14px 20px;border-radius:12px;background:#17191c;color:white;text-decoration:none;font-weight:700}</style></head><body><main class="wrap"><div class="brand"><span class="mark">D</span>OneDailyDrop</div><section class="card"><h1>Live deals are being refreshed.</h1><p>The site is switching from preview data to live retailer feeds.</p><div class="note">${String(detail).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</div><a class="refresh" href="/">Refresh page</a></section></main></body></html>`;
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
    const sourceCondition = config.demoMode
      ? "LOWER(COALESCE(source,''))='demo'"
      : "LOWER(COALESCE(source,''))<>'demo'";
    const daily = db.prepare(`
      SELECT p.*,d.rank AS daily_rank,d.selection_reason AS daily_selection_reason
      FROM daily_drops d
      JOIN products p ON p.id=d.product_id
      WHERE d.market=? AND d.drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=?)
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
    if (config.demoMode) {
      return res.json(products.map(product => localizeProduct({
        ...product,
        description: reasonFor(product),
        badge: ""
      }, language)));
    }
    return res.json(products.map(product => localizeProduct(product, language)));
  });

  app.get("/go/:id", (req, res, next) => {
    if (!config.isProduction) return next();
    if (config.demoMode) {
      const product = db.prepare("SELECT id FROM products WHERE id=? AND status='published' AND LOWER(COALESCE(source,''))='demo'").get(req.params.id);
      return product ? res.redirect(302, `/deal/${product.id}`) : res.sendStatus(404);
    }
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(req.params.id);
    if (String(product?.source || "").toLowerCase() === "demo") return res.status(410).send("This preview offer is unavailable in live mode.");
    return next();
  });

  app.get("/deal/:slug", (req, res, next) => {
    if (!config.isProduction || config.demoMode) return next();
    const id = String(req.params.slug).match(/-(\d+)$/)?.[1];
    if (!id) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(id);
    if (String(product?.source || "").toLowerCase() === "demo") return res.status(410).send("This preview product is unavailable in live mode.");
    return next();
  });

  app.get("/", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.redirect(302, marketPath(marketFromIp(req).code));
  });

  app.get(`/:market(${marketCodes.join("|")})`, (req, res) => {
    req.market = marketFromRequest(req).code;
    const status = catalogStatus(req.market);
    if (config.isProduction && !config.demoMode && status.liveProducts === 0) {
      return res.status(503).type("html").send(unavailablePage(status));
    }
    return renderHomepage(req, res);
  });

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
