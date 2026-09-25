const config = require("./config");

const enabledSources = new Set((config.enabledSourceIds || [])
  .map(source => String(source || "").trim().toLowerCase())
  .filter(Boolean));

// A source is public only when its credentials or approved affiliate feed are
// actually configured. PUBLIC_PRODUCT_SOURCES may narrow that set, but can
// never activate an unconfigured source.
const requestedSources = String(process.env.PUBLIC_PRODUCT_SOURCES || "")
  .split(",")
  .map(source => source.trim().toLowerCase())
  .filter(Boolean);

const PUBLIC_PRODUCT_SOURCES = Object.freeze(
  [...new Set((requestedSources.length ? requestedSources : [...enabledSources])
    .filter(source => enabledSources.has(source)))]
);

const quotedSources = PUBLIC_PRODUCT_SOURCES.length
  ? PUBLIC_PRODUCT_SOURCES.map(source => `'${source.replace(/'/g, "''")}'`).join(",")
  : "'__no_public_source__'";

/*
 * No price ceiling on the catalogue.
 *
 * There was one, at five thousand dollars, added because the price filter's
 * upper bound read $66,479 — an HPE rack server — and the slider on every
 * category page was scaled to it. That fixed the slider by deleting forty-seven
 * products, which is the wrong tool: a catalogue is not improved by hiding what
 * a shop sells, and the shopper who wants a workstation is not helped by
 * pretending it does not exist.
 *
 * The slider is fixed where it broke instead — its bounds come from a
 * percentile now rather than the single most expensive listing, and its top
 * end means "and up", so everything above stays reachable.
 */

const sourceSql = (alias = "") => {
  const prefix = alias ? `${alias}.` : "";
  return `(LOWER(COALESCE(${prefix}source,'')) IN (${quotedSources})
    AND LOWER(COALESCE(${prefix}availability,'')) NOT LIKE '%unavailable%'
    AND LOWER(COALESCE(${prefix}availability,'')) NOT LIKE '%out of stock%'
    AND LOWER(COALESCE(${prefix}availability,'')) NOT LIKE '%sold out%'
    AND LOWER(COALESCE(${prefix}availability,'')) NOT LIKE '%expired%'
    AND LOWER(COALESCE(${prefix}availability,'')) NOT LIKE '%discontinued%')`;
};

const isPublicSource = source => PUBLIC_PRODUCT_SOURCES.includes(
  String(source || "").trim().toLowerCase()
);

const isAvailable = availability => !/\b(?:out of stock|unavailable|sold out|expired|discontinued)\b/i.test(
  String(availability || "")
);
const isWithinConsumerPrice = price => !CONSUMER_PRICE_CEILING ||
  !(Number(price) > CONSUMER_PRICE_CEILING);

const isPublicProduct = product => Boolean(product) &&
  isPublicSource(product.source) &&
  isAvailable(product.availability) &&
  product.status === "published";

/**
 * One row per product, for every list the site renders.
 *
 * This lives here because it existed twice: once in src/server.js and once in
 * app.js, and app.js registers its /api/products first — so on Azure the
 * app.js copy is the one that answers and the src/server.js one is dead code.
 * A dedup rule improved in one file therefore did nothing in production, which
 * is exactly what happened while chasing duplicate listings.
 *
 * Identifier keys (barcode, source group, item id) catch most repeats. What
 * they missed is one seller listing the same thing several times with no
 * identifier at all — eBay produced runs of five and seven near-identical
 * rows, and the catalog showed the same product three cards in a row. That is
 * what `offerRepeatKey` closes.
 *
 * A read-time rule on purpose: the losing rows stay in the table because a
 * second offer for the same product from a *different* retailer is the price
 * comparison, and the retailer is part of that key so those never collide.
 */
const uniqueProductsInOrder = products => {
  const { deduplicationKeys, offerRepeatKey } = require("./ranker");
  const used = new Set();
  const unique = [];
  for (const product of products || []) {
    const marketPrefix = String(product.market || "").toLowerCase();
    const repeat = offerRepeatKey(product);
    const keys = [
      ...deduplicationKeys(product),
      ...(repeat ? [repeat] : []),
    ].map(key => `${marketPrefix}:${key}`);
    if (keys.some(key => used.has(key))) continue;
    unique.push(product);
    keys.forEach(key => used.add(key));
  }
  return unique;
};

/*
 * How many listings one shop may fill a category with.
 *
 * Newegg sends 1,500 of the 1,532 listings in Electronics, so the category
 * page, the sitemap and every count on the site were one supplier's feed with
 * a OneDailyDrop header on it. Nothing about those listings is wrong; there
 * are simply far too many of them to publish as a shelf we chose.
 *
 * The cap is absolute rather than a share of the category: a percentage would
 * shrink Electronics to fifty listings, because there is almost nobody else in
 * it. This keeps the best of each shop, in the order the ranking already put
 * them, and leaves the rest in the database — searchable, reachable by direct
 * link, and out of the pages we publish as a selection.
 */
const CATEGORY_SOURCE_CAP = (() => {
  const configured = Number(process.env.CATEGORY_SOURCE_CAP);
  if (Number.isFinite(configured) && configured >= 0) return Math.floor(configured);
  return 300;
})();

const capPerSourceAndCategory = (products, { cap = CATEGORY_SOURCE_CAP } = {}) => {
  if (!cap) return products;
  const counts = new Map();
  const kept = [];
  for (const product of products) {
    const category = String(product?.normalized_category || product?.category || "").toLowerCase();
    const source = String(product?.source || "").toLowerCase();
    const key = `${category}::${source}`;
    const used = counts.get(key) || 0;
    if (used >= cap) continue;
    counts.set(key, used + 1);
    kept.push(product);
  }
  return kept;
};

module.exports = {
  CATEGORY_SOURCE_CAP, capPerSourceAndCategory,
  PUBLIC_PRODUCT_SOURCES, sourceSql, isAvailable, isPublicProduct, isPublicSource, uniqueProductsInOrder };
