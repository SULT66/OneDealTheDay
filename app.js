// Azure App Service entry point (package.json's "start" script).
// Runtime restart marker: compact homepage catalog payload, August 13, 2026.
// Register catalog mode safeguards before src/server adds express.static();
// the market homepage itself is now rendered by the Next.js frontend (see
// the bottom of src/server.js), not here.
/**
 * A rejected promise nobody catches terminates the process in Node 15 and
 * later. In Express 4 an async route handler that throws produces exactly
 * that, which is how a single failing database read took the entire site down
 * on 2026-08-20: every page answered 500 — including the ones served here and
 * the static legal pages — until App Service restarted the container.
 *
 * One broken request should stay one broken request. The reason is logged so
 * it still reaches the Azure log stream rather than disappearing quietly.
 */
process.on("unhandledRejection", reason => {
  console.error("[unhandledRejection]", reason instanceof Error ? reason.stack : reason);
});

/**
 * An uncaught exception leaves the process in an unknown state, so this one
 * does exit and lets the platform restart it — the usual advice, and right
 * here too. Express catches anything a synchronous handler throws, so what
 * reaches this point happened outside a request and is not safe to ignore.
 */
process.on("uncaughtException", error => {
  console.error("[uncaughtException]", error?.stack || error);
  process.exit(1);
});

const express = require("express");
const helmet = require("helmet");
const cron = require("node-cron");
const db = require("./src/db");
const config = require("./src/config");
const { localizeProduct } = require("./src/demoTranslations");
const { presentProduct } = require("./src/productPresentation");
const { codes: marketCodes, normalizeMarket, marketFromIp, marketPath } = require("./src/markets");
const { resolveLanguage } = require("./src/i18n");
const { sourceSql, isPublicProduct, uniqueProductsInOrder } = require("./src/publicCatalog");
const { enabledProviders } = require("./src/providers/registry");
const { coverage: retailerCoverage } = require("./src/retailerCatalog");
const { recalculateCatalog } = require("./src/catalogRecalculation");
const { TAXONOMY_VERSION } = require("./src/catalogTaxonomy");
const { RELEASE_ID } = require("./src/release");
const { parseSearchOptions, searchCatalogProducts } = require("./src/catalogSearch");
const { applySearchIntent } = require("./src/searchIntent");
const createExpressApp = express;
const CANONICAL_HOST = "www.onedailydrop.com";
const AZURE_PRODUCTION_HOST = "onedealtheday-g3dme0aghzerc3a2.centralus-01.azurewebsites.net";
const apiResponseCache = new Map();
const searchCatalogCache = new Map();
const cachedValue = key => {
  const entry = apiResponseCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) apiResponseCache.delete(key);
    return null;
  }
  return entry.value;
};
const cacheValue = (key, value, ttlMs) => {
  if (apiResponseCache.size >= 200) apiResponseCache.delete(apiResponseCache.keys().next().value);
  apiResponseCache.set(key, { value, expiresAt:Date.now() + ttlMs });
  return value;
};
const dealSlug = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "deal";
const dealPath = product => marketPath(product.market || "us", `/deal/${dealSlug(product.canonical_title || product.title)}-${product.id}`);
const searchRowsForMarket = marketCode => {
  const cached = searchCatalogCache.get(marketCode);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const rows = db.prepare(`
    SELECT * FROM products
    WHERE market=? AND status='published' AND ${sourceSql()}
  `).all(marketCode);
  searchCatalogCache.set(marketCode, {rows, expiresAt:Date.now() + 60000});
  return rows;
};

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

function catalogStatus(marketCode = "") {
  const marketWhere = marketCode ? "market=? AND " : "";
  const params = marketCode ? [marketCode] : [];
  const latestRun = marketCode
    ? db.prepare("SELECT provider,market,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs WHERE market=? ORDER BY id DESC LIMIT 1").get(marketCode) || null
    : db.prepare("SELECT provider,market,started_at,finished_at,found_count,published_count,status,message FROM refresh_runs ORDER BY id DESC LIMIT 1").get() || null;
  return {
    releaseId: RELEASE_ID,
    taxonomyVersion: TAXONOMY_VERSION,
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
    const cacheKey = `status:${marketCode}`;
    const cached = cachedValue(cacheKey);
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "public, max-age=10, stale-while-revalidate=30");
    if (cached) return res.set("X-ODD-Cache", "HIT").json(cached);
    const status = cacheValue(cacheKey, catalogStatus(marketCode), 10000);
    return res.set("X-ODD-Cache", "MISS").json(status);
  });

  app.get("/api/search", (req, res) => {
    const selectedMarket = normalizeMarket(req.query.market) || marketFromIp(req).code;
    const language = resolveLanguage(req, res, selectedMarket);
    const rows = searchRowsForMarket(selectedMarket);
    const interpreted = applySearchIntent(req.query, rows);
    let options;
    try {
      options = parseSearchOptions(interpreted.query);
    } catch (error) {
      res.set("X-Robots-Tag", "noindex, nofollow");
      return res.status(400).json({error:error.message});
    }
    const cacheKey = `search:${selectedMarket}:${language}:${JSON.stringify({options, originalQuery:interpreted.intent.originalQuery})}`;
    const cached = cachedValue(cacheKey);
    if (cached) {
      res.set("X-Robots-Tag", "noindex, nofollow");
      res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
      return res.set("X-ODD-Cache", "HIT").json(cached);
    }
    const result = searchCatalogProducts(rows, options);
    const products = result.products.map(product => presentProduct(localizeProduct(product, language), language));
    res.set("X-Robots-Tag", "noindex, nofollow");
    res.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120");
    const payload = cacheValue(cacheKey, {
      query:interpreted.intent.originalQuery || options.query,
      search_query:options.query,
      parsed_intent:{
        inferred:interpreted.intent.inferred,
        category:interpreted.intent.category || null,
        merchant:interpreted.intent.merchant || null,
        min_price:interpreted.intent.minimumPrice,
        max_price:interpreted.intent.maximumPrice
      },
      market:selectedMarket,
      filters:{
        categories:options.categories,
        merchants:options.merchants,
        availability:options.availability,
        min_price:options.minimumPrice,
        max_price:options.maximumPrice,
        min_match:options.minimumMatch,
        min_quality:options.minimumQuality,
        updated_after:options.updatedAfter
      },
      sort:options.sort,
      ranking_model:"ranking-v1",
      pagination:result.pagination,
      facets:result.facets,
      products
    }, 30000);
    return res.set("X-ODD-Cache", "MISS").json(payload);
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
    const cacheKey = `products:${selectedMarket}:${language}:${responseLimit}:${compactResponse ? 1 : 0}`;
    const cached = cachedValue(cacheKey);
    res.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
    if (cached) return res.set("X-ODD-Cache", "HIT").json(cached);
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
      .map(product => presentProduct(localizeProduct({
        ...product,
        deal_url:dealPath(product)
      }, language), language))
      .map(product => {
        if (!compactResponse) return product;
        return {
          id:product.id,
          market:product.market,
          source:product.source,
          title:product.title,
          description:String(product.description || "").slice(0, 180),
          public_category:product.public_category,
          display_category:product.display_category,
          brand:product.brand,
          image_url:product.image_url,
          retailer_name:product.retailer_name,
          seller_name:product.seller_name,
          seller_rating:product.seller_rating,
          seller_feedback_count:product.seller_feedback_count,
          current_price:product.current_price,
          original_price:product.original_price,
          currency:product.currency,
          checked_at:product.checked_at,
          updated_at:product.updated_at,
          rating:product.rating,
          review_count:product.review_count,
          daily_rank:product.daily_rank,
          deal_url:product.deal_url,
          display_badge:product.display_badge,
          display_score:product.display_score,
          display_selection_reason:product.display_selection_reason,
          display_product_rating:product.display_product_rating,
          display_product_rating_label:product.display_product_rating_label,
          display_seller_rating:product.display_seller_rating,
          display_seller_rating_label:product.display_seller_rating_label,
          display_seller_feedback:product.display_seller_feedback,
          display_shipping_summary:product.display_shipping_summary,
          display_return_summary:product.display_return_summary,
          display_availability:product.display_availability
        };
      });
    cacheValue(cacheKey, presented, 60000);
    return res.set("X-ODD-Cache", "MISS").json(presented);
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

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
