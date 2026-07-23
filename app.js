// Bluehost cPanel / Phusion Passenger entry point.
// Register production safeguards and the SEO homepage before src/server adds express.static().
const express = require("express");
const db = require("./src/db");
const config = require("./src/config");
const renderHomepage = require("./src/homepage-seo");
const createExpressApp = express;

function countProducts(where = "1=1") {
  return Number(db.prepare(`SELECT COUNT(*) n FROM products WHERE status='published' AND ${where}`).get().n || 0);
}

function liveCatalogStatus() {
  return {
    provider: config.provider,
    requestedProvider: config.requestedProvider,
    products: countProducts(),
    liveProducts: countProducts("LOWER(COALESCE(source,''))<>'demo'"),
    demoProducts: countProducts("LOWER(COALESCE(source,''))='demo'"),
    amazonApiConfigured: Boolean(config.rainforestApiKey),
    walmartApiConfigured: Boolean(config.bluecartApiKey),
    affiliateTagConfigured: Boolean(config.affiliateTagConfigured),
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
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalog refresh in progress | OneDailyDrop</title><meta name="robots" content="noindex"><style>body{margin:0;font-family:Arial,sans-serif;background:#f5f6f8;color:#17191c}.wrap{max-width:760px;margin:12vh auto;padding:32px}.brand{font-weight:800;font-size:24px}.mark{display:inline-grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#ff6b00;color:white;margin-right:12px}.card{margin-top:34px;background:white;border:1px solid #e2e5e9;border-radius:24px;padding:42px;box-shadow:0 18px 55px rgba(0,0,0,.08)}h1{font-size:42px;margin:0 0 16px}p{font-size:18px;line-height:1.6;color:#66707d}.note{margin-top:24px;padding:16px 18px;border-radius:14px;background:#fff3eb;color:#8a3c00;font-size:14px}.refresh{display:inline-block;margin-top:24px;padding:14px 20px;border-radius:12px;background:#17191c;color:white;text-decoration:none;font-weight:700}</style></head><body><main class="wrap"><div class="brand"><span class="mark">D</span>OneDailyDrop</div><section class="card"><h1>Live deals are being refreshed.</h1><p>We temporarily removed the demo catalog so visitors never see invented prices, ratings or retailer links.</p><div class="note">${String(detail).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div><a class="refresh" href="/">Refresh page</a></section></main></body></html>`;
}

function expressWithHomepage(...args) {
  const app = createExpressApp(...args);

  app.get("/api/status", (req, res) => res.json(liveCatalogStatus()));
  app.get("/api/products", (req, res, next) => {
    if (!config.isProduction) return next();
    const products = db.prepare("SELECT * FROM products WHERE status='published' AND LOWER(COALESCE(source,''))<>'demo' ORDER BY score DESC,updated_at DESC").all();
    return res.json(products);
  });

  app.get("/go/:id", (req, res, next) => {
    if (!config.isProduction) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(req.params.id);
    if (String(product?.source || "").toLowerCase() === "demo") return res.status(410).send("This demo offer has been removed.");
    return next();
  });

  app.get("/deal/:slug", (req, res, next) => {
    if (!config.isProduction) return next();
    const id = String(req.params.slug).match(/-(\d+)$/)?.[1];
    if (!id) return next();
    const product = db.prepare("SELECT source FROM products WHERE id=? AND status='published'").get(id);
    if (String(product?.source || "").toLowerCase() === "demo") return res.status(410).send("This demo product has been removed.");
    return next();
  });

  app.get("/", (req, res) => {
    const status = liveCatalogStatus();
    if (config.isProduction && status.liveProducts === 0) {
      return res.status(503).type("html").send(unavailablePage(status));
    }
    return renderHomepage(req, res);
  });

  return app;
}

Object.assign(expressWithHomepage, createExpressApp);
require.cache[require.resolve("express")].exports = expressWithHomepage;
require("./src/server");
