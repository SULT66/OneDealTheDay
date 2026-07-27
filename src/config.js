require("dotenv").config();
const { codes: supportedMarketCodes, market } = require("./markets");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const rainforestApiKey = String(process.env.RAINFOREST_API_KEY || "").trim();
const bluecartApiKey = String(process.env.BLUECART_API_KEY || "").trim();
const requestedProvider = String(process.env.PRODUCT_PROVIDER || "").trim().toLowerCase();
const siteMode = String(process.env.SITE_MODE || "demo").trim().toLowerCase();
const demoMode = siteMode !== "live";
const liveRefreshEnabled = !demoMode && String(process.env.LIVE_REFRESH_ENABLED || "false").trim().toLowerCase() === "true";

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

function resolveLiveProvider() {
  if (requestedProvider && !["demo", "auto"].includes(requestedProvider)) return requestedProvider;
  if (rainforestApiKey && bluecartApiKey) return "multi";
  if (rainforestApiKey) return "rainforest";
  if (bluecartApiKey) return "walmart";
  return "unconfigured";
}

const configuredKeywords = String(process.env.SEARCH_KEYWORDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const configuredMarkets = String(process.env.SUPPORTED_MARKETS || supportedMarketCodes.join(","))
  .split(",")
  .map(value => value.trim().toLowerCase())
  .filter(value => supportedMarketCodes.includes(value));

const markets = [...new Set(configuredMarkets.length ? configuredMarkets : ["us"])];
const affiliateTagForMarket = code => String(
  process.env[`AFFILIATE_TAG_${String(code).toUpperCase()}`] ||
  (code === "us" ? process.env.AFFILIATE_TAG : "") ||
  ""
).trim();
const keywordsForMarket = code => {
  const configured = String(process.env[`SEARCH_KEYWORDS_${String(code).toUpperCase()}`] || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return configured.length ? configured : configuredKeywords.length ? configuredKeywords : defaultKeywords;
};
const marketConfig = code => {
  const selected = market(code);
  return {
    ...selected,
    affiliateTag: affiliateTagForMarket(selected.code),
    searchKeywords: keywordsForMarket(selected.code)
  };
};

module.exports = {
  port: Number(process.env.PORT || 8088),
  adminKey: process.env.ADMIN_KEY || "change-this-private-key",
  affiliateTag: String(process.env.AFFILIATE_TAG || "").trim(),
  affiliateTagConfigured: Boolean(String(process.env.AFFILIATE_TAG || "").trim()),
  provider: demoMode ? "demo" : resolveLiveProvider(),
  requestedProvider: requestedProvider || "auto",
  siteMode: demoMode ? "demo" : "live",
  demoMode,
  liveRefreshEnabled,
  offerCheckEnabled: !demoMode && liveRefreshEnabled && String(process.env.OFFER_CHECK_ENABLED || "false").trim().toLowerCase() === "true",
  rainforestApiKey,
  bluecartApiKey,
  isProduction: isAzure,
  refreshCron: process.env.REFRESH_CRON || "15 0 * * *",
  offerCheckCron: process.env.OFFER_CHECK_CRON || "15 * * * *",
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: configuredKeywords.length ? configuredKeywords : defaultKeywords,
  markets,
  defaultMarket: "us",
  marketConfig,
  affiliateTagForMarket
};
