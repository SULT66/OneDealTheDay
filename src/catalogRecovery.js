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

module.exports = async function recoverProductionCatalog(config) {
  const demoCount = countDemoProducts();
  if (!demoCount || config.provider === "demo") return { demoCount, liveCount: countLiveProducts(), removed: 0 };

  let liveCount = countLiveProducts();
  if (!liveCount) {
    console.log(`Production catalog contains ${demoCount} demo products. Refreshing live retailer feeds.`);
    try {
      await refreshProducts(config);
    } catch (error) {
      console.error(`Live catalog recovery failed: ${error.message}`);
    }
    liveCount = countLiveProducts();
  }

  if (!liveCount) {
    console.error("Demo catalog was not removed because no live retailer products are available yet.");
    return { demoCount, liveCount: 0, removed: 0 };
  }

  const removed = removeDemoProducts();
  console.log(`Removed ${removed} persisted demo products; ${liveCount} live products remain.`);
  return { demoCount, liveCount, removed };
};
