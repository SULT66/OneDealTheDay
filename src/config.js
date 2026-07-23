require("dotenv").config();

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const rainforestApiKey = String(process.env.RAINFOREST_API_KEY || "").trim();
const bluecartApiKey = String(process.env.BLUECART_API_KEY || "").trim();
const requestedProvider = String(process.env.PRODUCT_PROVIDER || "").trim().toLowerCase();
const defaultKeywords = [
  "home gadgets",
  "kitchen gadgets",
  "car accessories",
  "smart home",
  "pet supplies",
  "tools",
  "travel accessories",
  "office gadgets",
  "fitness accessories",
  "gifts under 25"
];

function resolveProvider() {
  if (!isAzure) return requestedProvider || "demo";

  // Demo data is never allowed on the public Azure site, even when an old
  // PRODUCT_PROVIDER=demo application setting is still present.
  if (requestedProvider && !["demo", "auto"].includes(requestedProvider)) {
    return requestedProvider;
  }
  if (rainforestApiKey && bluecartApiKey) return "multi";
  if (rainforestApiKey) return "rainforest";
  if (bluecartApiKey) return "walmart";
  return "unconfigured";
}

const configuredKeywords = String(process.env.SEARCH_KEYWORDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const config = {
  port: Number(process.env.PORT || 8088),
  adminKey: process.env.ADMIN_KEY || "change-this-private-key",
  affiliateTag: String(process.env.AFFILIATE_TAG || "").trim(),
  affiliateTagConfigured: Boolean(String(process.env.AFFILIATE_TAG || "").trim()),
  provider: resolveProvider(),
  requestedProvider: requestedProvider || "auto",
  rainforestApiKey,
  bluecartApiKey,
  isProduction: isAzure,
  refreshCron: process.env.REFRESH_CRON || "15 6 * * *",
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: configuredKeywords.length ? configuredKeywords : defaultKeywords
};

module.exports = config;

if (isAzure) {
  setImmediate(() => {
    require("./catalogRecovery")(config).catch(error => {
      console.error(`Production catalog recovery error: ${error.message}`);
    });
  });
}
