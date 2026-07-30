const PUBLIC_PRODUCT_SOURCES = Object.freeze([
  "amazon-manual",
  "amazon-creators-api",
  "amazon-pa-api",
  "bestbuy-products-api"
]);

const quotedSources = PUBLIC_PRODUCT_SOURCES
  .map(source => `'${source.replace(/'/g, "''")}'`)
  .join(",");

const sourceSql = (alias = "") => {
  const prefix = alias ? `${alias}.` : "";
  return `LOWER(COALESCE(${prefix}source,'')) IN (${quotedSources})`;
};

const isPublicSource = source => PUBLIC_PRODUCT_SOURCES.includes(
  String(source || "").trim().toLowerCase()
);

module.exports = {
  PUBLIC_PRODUCT_SOURCES,
  sourceSql,
  isPublicSource
};
