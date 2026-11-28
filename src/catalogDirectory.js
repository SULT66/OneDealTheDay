const { catalogSnapshot } = require("./catalogSnapshot");
const { RETAILERS } = require("./retailerCatalog");
const { storefrontUrl } = require("./storefrontLinks");

const FRESH_MS = 60_000;
const STALE_MS = 5 * FRESH_MS;
const declaredHosts = new Map(RETAILERS.map(({name, storefrontHost}) => [
  String(name || "").trim().toLowerCase(),
  String(storefrontHost || "").trim().toLowerCase(),
]));

function buildDirectory(rows) {
  const categories = new Map();
  const shops = new Map();
  for (const product of catalogSnapshot(rows)) {
    const category = product.normalized_category;
    categories.set(category, (categories.get(category) || 0) + 1);
    const retailer = product.retailer_name || product.source;
    if (!retailer) continue;
    const shop = shops.get(retailer) || {retailer, listings: 0, host: declaredHosts.get(retailer.trim().toLowerCase()) || ""};
    shop.listings++;
    shops.set(retailer, shop);
  }

  const unknown = new Map([...shops].filter(([, shop]) => !shop.host).map(([retailer]) => [retailer, 0]));
  if (unknown.size) {
    for (const product of [...rows].sort((a, b) => b.id - a.id)) {
      const retailer = product.retailer_name || product.source;
      if (!unknown.has(retailer)) continue;
      const attempts = unknown.get(retailer) + 1;
      unknown.set(retailer, attempts);
      const link = storefrontUrl(product);
      if (link) {
        const carried = link.url.match(/[?&](?:ued|murl|url|u)=([^&]+)/);
        try {
          const target = carried ? decodeURIComponent(carried[1]) : link.url;
          shops.get(retailer).host = new URL(target).hostname.replace(/^www\./, "");
        } catch { /* Keep the directory entry when its store URL cannot be parsed. */ }
      }
      if (link || attempts >= 25) unknown.delete(retailer);
      if (!unknown.size) break;
    }
  }

  return {
    categories: [...categories].map(([category, count]) => ({category, count})).sort((a, b) => b.count - a.count),
    shops: [...shops.values()].sort((a, b) => b.listings - a.listings),
  };
}

function createCatalogDirectory({ readRows, now = Date.now, defer = setImmediate, onError = console.warn }) {
  const entries = new Map();
  function refresh(market) {
    const value = buildDirectory(readRows(market));
    const entry = {value, createdAt: now(), pending: false};
    entries.set(market, entry);
    return entry;
  }
  return market => {
    const entry = entries.get(market);
    const age = entry ? now() - entry.createdAt : Infinity;
    if (age >= STALE_MS) return {data: refresh(market).value, cache: "MISS"};
    if (age < FRESH_MS) return {data: entry.value, cache: "HIT"};
    if (!entry.pending) {
      entry.pending = true;
      defer(() => {
        if (entries.get(market) !== entry) return;
        try { refresh(market); }
        catch (error) {
          entry.pending = false;
          onError(`[catalog-directory] ${market}: ${error.message}`);
        }
      });
    }
    return {data: entry.value, cache: "STALE"};
  };
}

module.exports = { createCatalogDirectory };
