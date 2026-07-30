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
  return {
    siteMode: config.siteMode,
    provider: config.provider,
    requestedProvider: config.requestedProvider,
    liveRefreshEnabled: Boolean(config.liveRefreshEnabled),
    market: marketCode || "all",
    products: countProducts(`${marketWhere}1=1`, params),
    liveProducts: countProducts(`${marketWhere}LOWER(COALESCE(source,''))='rainforest'`, params),
    demoProducts: 0,
    amazonApiConfigured: Boolean(config.rainforestApiKey),
    walmartApiConfigured: Boolean(config.bluecartApiKey),
    affiliateTagConfigured: marketCode ? Boolean(config.affiliateTagForMarket(marketCode)) : Boolean(config.affiliateTagConfigured),
    searchKeywordCount: config.searchKeywords.length,
    lastRun: db.prepare("SELECT provider,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null
  };
}

function unavailablePage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Amazon catalog coming soon | OneDailyDrop</title><meta name="description" content="OneDailyDrop is connecting its live Amazon product catalog. Only real products and current retailer data will be published."><meta name="robots" content="index,follow"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><style>body{margin:0;font-family:Arial,sans-serif;background:#f5f6f8;color:#17191c}.wrap{max-width:820px;margin:10vh auto;padding:32px}.brand{font-weight:800;font-size:24px}.mark{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#2764ff;color:white;margin-right:12px}.card{margin-top:34px;background:white;border:1px solid #e2e5e9;border-radius:24px;padding:clamp(28px,6vw,56px);box-shadow:0 18px 55px rgba(0,0,0,.08)}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:#2764ff}h1{font-size:clamp(38px,7vw,64px);line-height:1.02;margin:12px 0 20px}p{font-size:18px;line-height:1.65;color:#66707d;max-width:650px}.promise{margin-top:26px;padding:18px 20px;border-radius:14px;background:#eef3ff;color:#27406f;font-size:15px}.links{display:flex;flex-wrap:wrap;gap:18px;margin-top:32px}.links a{color:#323a46;font-size:14px}</style></head><body><main class="wrap"><div class="brand"><span class="mark">D</span>OneDailyDrop</div><section class="card"><div class="eyebrow">LIVE CATALOG IN PROGRESS</div><h1>Real Amazon products are coming.</h1><p>We are connecting our live Amazon catalog. Until the connection is ready, we will not show sample products, estimated prices or made-up ratings.</p><div class="promise">Only real Amazon products with current retailer data will be published here.</div><nav class="links"><a href="/about">About</a><a href="/contact">Contact</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/affiliate-disclosure">Affiliate Disclosure</a></nav></section></main></body></html>`;
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
    const sourceCondition = "LOWER(COALESCE(source,''))='rainforest'";
    const daily = db.prepare(`
      SELECT p.*,d.rank AS daily_rank,d.selection_reason AS daily_selection_reason
      FROM daily_drops d
      JOIN products p ON p.id=d.product_id
      WHERE d.market=? AND d.drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=?)
        AND LOWER(COALESCE(p.source,''))='rainforest'
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
    if (String(product?.source || "").toLowerCase() !== "rainforest") return res.sendStatus(404);
    return next();
  });

  app.get("/deal/:slug", (req, res, next) => {
    if (!config.isProduction) return next();
    const id = String(req.params.slug).match(/-(\d+)$/)?.[1];
    if (!id) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(id);
    if (String(product?.source || "").toLowerCase() !== "rainforest") return res.sendStatus(404);
    return next();
  });

  app.get("/", (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.redirect(302, marketPath(marketFromIp(req).code));
  });

  app.get(`/:market(${marketCodes.join("|")})`, (req, res) => {
    req.market = marketFromRequest(req).code;
    const status = catalogStatus(req.market);
    if (status.liveProducts === 0) {
      return res.status(200).type("html").send(unavailablePage());
    }
    return renderHomepage(req, res);
  });

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
