// Bluehost cPanel / Phusion Passenger entry point.
// Deployment refresh: homepage anchors and search, July 28, 2026.
// Register catalog mode safeguards and the SEO homepage before src/server adds express.static().
const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const db = require("./src/db");
const config = require("./src/config");
const { localizeProduct } = require("./src/demoTranslations");
const { presentProduct } = require("./src/productPresentation");
const renderHomepage = require("./src/homepage-seo");
const { codes: marketCodes, normalizeMarket, marketFromIp, marketFromRequest, marketPath } = require("./src/markets");
const { resolveLanguage } = require("./src/i18n");
const { sourceSql, isPublicProduct } = require("./src/publicCatalog");
const { enabledProviders } = require("./src/providers/registry");
const { coverage: retailerCoverage } = require("./src/retailerCatalog");
const { recalculateCatalog } = require("./src/catalogRecalculation");
const { deduplicationKeys } = require("./src/ranker");
const createExpressApp = express;
const CANONICAL_HOST = "www.onedailydrop.com";
const AZURE_PRODUCTION_HOST = "onedealtheday-g3dme0aghzerc3a2.centralus-01.azurewebsites.net";

if (config.isProduction) {
  const recalculated = recalculateCatalog(db, marketCodes, {selectionMarkets:config.markets});
  if (recalculated.changed) console.log(`Recalculated ${recalculated.products} catalog products and ${recalculated.selections} daily selections with ${require("./src/ranker").SCORE_MODEL}.`);
}

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

function uniqueProductsInOrder(products) {
  const used = new Set();
  const unique = [];
  for (const product of products || []) {
    const marketPrefix = String(product.market || "").toLowerCase();
    const keys = deduplicationKeys(product).map(key => `${marketPrefix}:${key}`);
    if (keys.some(key => used.has(key))) continue;
    unique.push(product);
    keys.forEach(key => used.add(key));
  }
  return unique;
}

function catalogStatus(marketCode = "") {
  const marketWhere = marketCode ? "market=? AND " : "";
  const params = marketCode ? [marketCode] : [];
  const latestRun = marketCode
    ? db.prepare("SELECT provider,market,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs WHERE market=? ORDER BY id DESC LIMIT 1").get(marketCode) || null
    : db.prepare("SELECT provider,market,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null;
  return {
    siteMode: config.siteMode,
    provider: config.provider,
    requestedProvider: config.requestedProvider,
    sources: enabledProviders(config).map(provider => ({id:provider.id, source:provider.source, name:provider.name, markets:provider.markets})),
    retailerCoverage: retailerCoverage(enabledProviders(config)),
    liveRefreshEnabled: Boolean(config.liveRefreshEnabled),
    market: marketCode || "all",
    products: countProducts(`${marketWhere}1=1`, params),
    liveProducts: countProducts(`${marketWhere}${sourceSql()}`, params),
    demoProducts: 0,
    automatedCatalogConfigured: config.provider !== "unconfigured",
    affiliateTagConfigured: marketCode ? Boolean(config.affiliateTagForMarket(marketCode)) : Boolean(config.affiliateTagConfigured),
    searchKeywordCount: config.searchKeywords.length,
    lastRun: config.liveRefreshEnabled ? latestRun : null
  };
}

function expressWithHomepage(...args) {
  const app = createExpressApp(...args);
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy:false }));
  app.use((req, res, next) => {
    const forwardedHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
      .split(",")[0]
      .trim()
      .toLowerCase()
      .replace(/:\d+$/, "");
    const originalUrl = req.originalUrl || "/";
    const isRead = req.method === "GET" || req.method === "HEAD";
    const queryIndex = originalUrl.indexOf("?");
    const pathname = queryIndex >= 0 ? originalUrl.slice(0, queryIndex) : originalUrl;
    const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : "";
    const marketMatch = pathname.match(new RegExp(`^/(${marketCodes.join("|")})(?=/|$)`, "i"));
    const normalizedMarketPath = marketMatch && marketMatch[1] !== marketMatch[1].toLowerCase()
      ? `/${marketMatch[1].toLowerCase()}${pathname.slice(marketMatch[0].length)}`
      : pathname;
    const normalizedPath = normalizedMarketPath.length > 1
      ? normalizedMarketPath.replace(/\/+$/, "")
      : normalizedMarketPath;
    const normalizedOriginalUrl = `${normalizedPath}${query}`;
    const isPublicAzurePage = forwardedHost === AZURE_PRODUCTION_HOST && !req.path.startsWith("/api/");
    const insecureCanonicalRequest = forwardedHost === CANONICAL_HOST && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "http";
    if (forwardedHost === "onedailydrop.com" || (isRead && isPublicAzurePage) || (isRead && insecureCanonicalRequest)) {
      return res.redirect(301, `https://${CANONICAL_HOST}${normalizedOriginalUrl}`);
    }

    if (!isRead) return next();
    if (normalizedPath !== pathname) return res.redirect(301, `${normalizedPath}${query}`);
    return next();
  });

  app.get("/api/status", (req, res) => {
    const marketCode = normalizeMarket(req.query.market) || marketFromIp(req).code;
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.json(catalogStatus(marketCode));
  });

  app.get("/api/products", (req, res, next) => {
    if (!config.isProduction) return next();
    const selectedMarket = normalizeMarket(req.query.market) || marketFromIp(req).code;
    const language = resolveLanguage(req, res, selectedMarket);
    const requestedLimit = Number(req.query.limit);
    const responseLimit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.max(10, Math.min(1000, Math.round(requestedLimit)))
      : Number.MAX_SAFE_INTEGER;
    const compactResponse = String(req.query.compact || "") === "1";
    const catalogRowLimit = responseLimit < Number.MAX_SAFE_INTEGER
      ? ` LIMIT ${Math.min(2000, responseLimit * 2)}`
      : "";
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
      ${catalogRowLimit}
    `).all(selectedMarket).filter(product => !dailyIds.has(product.id));
    const products = uniqueProductsInOrder([...daily.map(product => ({
      ...product,
      selection_reason: product.daily_selection_reason || product.selection_reason
    })), ...catalog]).slice(0, responseLimit);
    const presented = products
      .map(product => presentProduct(localizeProduct(product, language), language))
      .map(product => {
        if (!compactResponse) return product;
        const {
          affiliate_url,
          retailer_shop_url,
          score_breakdown,
          external_id,
          provider_external_id,
          upc,
          gtin,
          ean,
          mpn,
          model_number,
          manufacturer,
          ...visible
        } = product;
        return {
          ...visible,
          description:String(product.description || "").slice(0, 500),
        };
      });
    return res.json(presented);
  });

  app.get("/go/:id", (req, res, next) => {
    if (!config.isProduction) return next();
    const product = db.prepare("SELECT source,availability,status FROM products WHERE id=?").get(req.params.id);
    if (!isPublicProduct(product)) return res.sendStatus(404);
    return next();
  });

  app.get("/deal/:slug", (req, res, next) => {
    if (!config.isProduction) return next();
    const id = String(req.params.slug).match(/-(\d+)$/)?.[1];
    if (!id) return next();
    const product = db.prepare("SELECT source,availability,status FROM products WHERE id=?").get(id);
    if (!isPublicProduct(product)) {
      res.set("X-Robots-Tag", "noindex, nofollow");
      return res.sendStatus(410);
    }
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
