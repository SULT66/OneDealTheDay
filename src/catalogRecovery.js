const db = require("./db");
const { refreshProducts } = require("./refresh");

function countLiveProducts() {
  return Number(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published' AND LOWER(COALESCE(source,''))<>'demo'").get().n || 0);
}

function countDemoProducts() {
  return Number(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published' AND LOWER(COALESCE(source,''))='demo'").get().n || 0);
}

function removeDemoProducts() {
  const demoIds = db.prepare("SELECT id FROM products WHERE LOWER(COALESCE(source,''))='demo'").all().map(row => row.id);
  if (!demoIds.length) return 0;

  const placeholders = demoIds.map(() => "?").join(",");
  db.transaction(() => {
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

module.exports = async function recoverProductionCatalog(config) {
  const demoCount = countDemoProducts();
  let liveCount = countLiveProducts();
  let refreshError = "";

  if (!liveCount && config.provider !== "unconfigured") {
    console.log(`Refreshing live production catalog with provider ${config.provider}.`);
    try {
      await refreshProducts(config);
    } catch (error) {
      refreshError = error.message;
      console.error(`Live catalog recovery failed: ${refreshError}`);
    }
    liveCount = countLiveProducts();
  } else if (!liveCount && config.provider === "unconfigured") {
    refreshError = "No live retailer API keys are configured in Azure App Settings";
    recordConfigurationFailure(config, refreshError);
    console.error(refreshError);
  }

  // Public production pages must never display invented demo prices, ratings,
  // reviews or affiliate links. Remove them even when live feeds are not ready.
  const removed = removeDemoProducts();
  if (removed) console.log(`Removed ${removed} demo products from the production database.`);

  liveCount = countLiveProducts();
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
