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
const { resolveLanguage, languageTag } = require("./src/i18n");
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

function unavailablePage(marketCode = "us", language = "en") {
  const copies = {
    en: {
      eyebrow: "EDITORIAL CATALOG UPDATE",
      title: "Real product selections are being prepared.",
      text: "We are replacing test listings with original, verified product selections. We do not publish sample products, estimated prices or made-up ratings.",
      promise: "Every published product will use a working retailer link and clearly identified source."
    },
    es: {
      eyebrow: "ACTUALIZACIÓN DEL CATÁLOGO EDITORIAL",
      title: "Estamos preparando selecciones de productos reales.",
      text: "Estamos reemplazando los listados de prueba con selecciones originales y verificadas. No publicamos productos de muestra, precios estimados ni valoraciones inventadas.",
      promise: "Cada producto publicado tendrá un enlace de tienda activo y una fuente claramente identificada."
    },
    fr: {
      eyebrow: "MISE À JOUR DU CATALOGUE ÉDITORIAL",
      title: "Nous préparons des sélections de produits réels.",
      text: "Nous remplaçons les fiches de test par des sélections originales et vérifiées. Nous ne publions ni produits fictifs, ni prix estimés, ni notes inventées.",
      promise: "Chaque produit publié aura un lien marchand actif et une source clairement identifiée."
    },
    de: {
      eyebrow: "AKTUALISIERUNG DES REDAKTIONELLEN KATALOGS",
      title: "Wir bereiten echte Produktempfehlungen vor.",
      text: "Wir ersetzen Testeinträge durch eigene, geprüfte Produktempfehlungen. Wir veröffentlichen keine Beispielprodukte, geschätzten Preise oder erfundenen Bewertungen.",
      promise: "Jedes veröffentlichte Produkt erhält einen funktionierenden Händlerlink und eine klar benannte Quelle."
    }
  };
  const copy = copies[language] || copies.en;
  const locale = languageTag(marketCode, language);
  const home = marketPath(marketCode);
  const safe = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const page = path => marketPath(marketCode, path);
  return `<!doctype html><html lang="${safe(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(copy.title)} | OneDailyDrop</title><meta name="description" content="${safe(copy.text)}"><meta name="robots" content="index,follow"><link rel="canonical" href="https://www.onedailydrop.com${home}"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><meta property="og:site_name" content="OneDailyDrop"><style>body{margin:0;font-family:Arial,sans-serif;background:#f5f6f8;color:#17191c}.wrap{max-width:820px;margin:10vh auto;padding:32px}.brand{font-weight:800;font-size:24px}.mark{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#2764ff;color:white;margin-right:12px}.card{margin-top:34px;background:white;border:1px solid #e2e5e9;border-radius:24px;padding:clamp(28px,6vw,56px);box-shadow:0 18px 55px rgba(0,0,0,.08)}.eyebrow{font-size:12px;font-weight:800;letter-spacing:.14em;color:#2764ff}h1{font-size:clamp(38px,7vw,64px);line-height:1.02;margin:12px 0 20px}p{font-size:18px;line-height:1.65;color:#66707d;max-width:650px}.promise{margin-top:26px;padding:18px 20px;border-radius:14px;background:#eef3ff;color:#27406f;font-size:15px}.links{display:flex;flex-wrap:wrap;gap:18px;margin-top:32px}.links a{color:#323a46;font-size:14px}</style></head><body><main class="wrap"><a class="brand" href="${home}"><span class="mark">D</span>OneDailyDrop</a><section class="card"><div class="eyebrow">${safe(copy.eyebrow)}</div><h1>${safe(copy.title)}</h1><p>${safe(copy.text)}</p><div class="promise">${safe(copy.promise)}</div><nav class="links"><a href="${page("/about")}">About</a><a href="${page("/contact")}">Contact</a><a href="${page("/privacy")}">Privacy</a><a href="${page("/terms")}">Terms</a><a href="${page("/affiliate-disclosure")}">Affiliate Disclosure</a><a href="${page("/editorial-policy")}">Editorial Policy</a></nav></section></main></body></html>`;
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
    const status = catalogStatus(req.market);
    if (status.liveProducts === 0) {
      const language = resolveLanguage(req, res, req.market);
      return res.status(200).type("html").send(unavailablePage(req.market, language));
    }
    return renderHomepage(req, res);
  });

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
