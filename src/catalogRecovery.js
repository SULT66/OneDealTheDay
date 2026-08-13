const db = require("./db");
const { refreshProducts } = require("./refresh");
const { sourceSql } = require("./publicCatalog");
const { providersForMarket } = require("./providers/registry");

function countLiveProducts(marketCode = "") {
  const marketFilter = marketCode ? " AND market=?" : "";
  const params = marketCode ? [marketCode] : [];
  return Number(db.prepare(
    `SELECT COUNT(*) n FROM products WHERE status='published' AND ${sourceSql()}${marketFilter}`
  ).get(...params).n || 0);
}

function countDemoProducts() {
  return Number(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published' AND LOWER(COALESCE(source,''))='demo'").get().n || 0);
}

function removeDemoProducts() {
  const demoIds = db.prepare("SELECT id FROM products WHERE LOWER(COALESCE(source,''))='demo'").all().map(row => row.id);
  if (!demoIds.length) return 0;

  const placeholders = demoIds.map(() => "?").join(",");
  db.transaction(() => {
    db.prepare(`DELETE FROM daily_drops WHERE product_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM price_history WHERE product_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM clicks WHERE product_id IN (${placeholders})`).run(...demoIds);
    db.prepare(`DELETE FROM products WHERE id IN (${placeholders})`).run(...demoIds);
  })();
  return demoIds.length;
}

function recordConfigurationFailure(config, message) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO refresh_runs(provider,started_at,finished_at,found_count,published_count,status,message) VALUES(?,?,?,?,?,'failed',?)")
    .run(config.provider, now, now, 0, 0, message);
}

function missingConfiguredProviders(config, marketCode) {
  const selectedMarket = config.marketConfig(marketCode);
  const configured = providersForMarket(config, selectedMarket).map(provider => provider.id);
  if (!configured.length) return [];
  const attempted = new Set(db.prepare(
    "SELECT DISTINCT provider_id FROM source_refresh_runs WHERE market=?"
  ).all(marketCode).map(row => String(row.provider_id || "")));
  return configured.filter(providerId => !attempted.has(providerId));
}

module.exports = async function recoverProductionCatalog(config) {
  const demoCount = countDemoProducts();
  const refreshErrors = [];
  const marketCodes = Array.isArray(config.markets) && config.markets.length ? config.markets : ["us"];

  if (config.provider !== "unconfigured") {
    for (const marketCode of marketCodes) {
      const missingProviders = missingConfiguredProviders(config, marketCode);
      if (countLiveProducts(marketCode) && !missingProviders.length) continue;
      const reason = missingProviders.length
        ? `new sources ${missingProviders.join(", ")}`
        : "an empty live catalog";
      console.log(`Refreshing ${marketCode.toUpperCase()} production catalog for ${reason}.`);
      try {
        await refreshProducts(config, { market: marketCode });
      } catch (error) {
        refreshErrors.push(`${marketCode}: ${error.message}`);
        console.error(`${marketCode.toUpperCase()} catalog recovery failed: ${error.message}`);
      }
    }
  } else if (!countLiveProducts()) {
    const refreshError = "No live retailer API keys are configured in Azure App Settings";
    refreshErrors.push(refreshError);
    recordConfigurationFailure(config, refreshError);
    console.error(refreshError);
  }

  // Public production pages must never display invented demo prices, ratings,
  // reviews or affiliate links. Remove them even when live feeds are not ready.
  const removed = removeDemoProducts();
  if (removed) console.log(`Removed ${removed} demo products from the production database.`);

  const liveCount = countLiveProducts();
  const refreshError = refreshErrors.join(" | ");
  if (!liveCount) {
    console.error(`Production catalog is empty. ${refreshError || "No live retailer products were returned."}`);
  }

  return {
    provider: config.provider,
    demoCount,
    liveCount,
    removed,
    refreshError
  };
};

module.exports.missingConfiguredProviders = missingConfiguredProviders;
