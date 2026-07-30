const PUBLIC_PRODUCT_SOURCES = Object.freeze([
  // Affiliate-approval launch mode: expose only the ten manually checked US
  // products. API sources can be enabled here after each retailer approves us.
  "amazon-manual"
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
