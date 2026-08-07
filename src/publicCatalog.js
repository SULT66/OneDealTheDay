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
  return `LOWER(COALESCE(${prefix}source,'')) IN (${quotedSources})`;
};

const isPublicSource = source => PUBLIC_PRODUCT_SOURCES.includes(
  String(source || "").trim().toLowerCase()
);

module.exports = { PUBLIC_PRODUCT_SOURCES, sourceSql, isPublicSource };
