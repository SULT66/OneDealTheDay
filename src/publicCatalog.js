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

module.exports = { PUBLIC_PRODUCT_SOURCES, sourceSql, isAvailable, isPublicProduct, isPublicSource };
