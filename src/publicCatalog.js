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

module.exports = { PUBLIC_PRODUCT_SOURCES, sourceSql, isAvailable, isPublicProduct, isPublicSource, uniqueProductsInOrder };
