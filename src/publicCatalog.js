const supportedSources = new Set([
  "rainforest",
  "amazon",
  "ebay",
  "walmart",
  "bluecart"
]);

// Only approved automated feeds can become public. No hand-entered or demo
// catalog is used as a fallback.
const configuredSources = String(process.env.PUBLIC_PRODUCT_SOURCES || "")
  .split(",")
  .map(source => source.trim().toLowerCase())
  .filter(source => supportedSources.has(source));

const ebayConfigured = Boolean(
  String(process.env.EBAY_CLIENT_ID || "").trim() &&
  String(process.env.EBAY_CLIENT_SECRET || "").trim() &&
  /^\d{10}$/.test(String(process.env.EBAY_CAMPAIGN_ID || "").trim())
);
if (ebayConfigured && !configuredSources.includes("ebay")) configuredSources.push("ebay");

const PUBLIC_PRODUCT_SOURCES = Object.freeze(
  [...new Set(configuredSources)]
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

module.exports = {
  PUBLIC_PRODUCT_SOURCES,
  sourceSql,
  isPublicSource
};
