const supportedSources = new Set([
  "amazon-manual",
  "rainforest",
  "amazon",
  "walmart",
  "bluecart"
]);

// Keep the launch catalog safe by default. Once a retailer approves the site,
// its provider can be enabled through configuration without a code release:
// PUBLIC_PRODUCT_SOURCES=amazon-manual,rainforest,walmart
const configuredSources = String(process.env.PUBLIC_PRODUCT_SOURCES || "amazon-manual")
  .split(",")
  .map(source => source.trim().toLowerCase())
  .filter(source => supportedSources.has(source));

const PUBLIC_PRODUCT_SOURCES = Object.freeze(
  [...new Set(configuredSources.length ? configuredSources : ["amazon-manual"])]
);

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
