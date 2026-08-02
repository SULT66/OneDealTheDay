require("dotenv").config();
const { codes: supportedMarketCodes, market } = require("./markets");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const rainforestApiKey = String(process.env.RAINFOREST_API_KEY || "").trim();
const bluecartApiKey = String(process.env.BLUECART_API_KEY || "").trim();
const adminKey = String(process.env.ADMIN_KEY || "").trim();
const ebayVerificationToken = String(process.env.EBAY_VERIFICATION_TOKEN || "").trim();
const ebayClientId = String(process.env.EBAY_CLIENT_ID || "").trim();
const ebayClientSecret = String(process.env.EBAY_CLIENT_SECRET || "").trim();
const ebayCampaignId = String(process.env.EBAY_CAMPAIGN_ID || "").trim();
const demoMode = false;

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
  if (ebayClientId && ebayClientSecret && /^\d{10}$/.test(ebayCampaignId)) return "ebay";
  return "unconfigured";
}

const provider = resolveLiveProvider();
const liveRefreshEnabled = provider === "ebay";

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
  adminKey,
  ebayVerificationToken,
  ebayAccountDeletionEndpoint: String(
    process.env.EBAY_ACCOUNT_DELETION_ENDPOINT || "https://www.onedailydrop.com/api/ebay/account-deletion"
  ).trim(),
  ebayClientId,
  ebayClientSecret,
  ebayCampaignId,
  ebayEnvironment: String(process.env.EBAY_ENVIRONMENT || "production").trim().toLowerCase(),
  affiliateTag: String(process.env.AFFILIATE_TAG || "").trim(),
  affiliateTagConfigured: Boolean(String(process.env.AFFILIATE_TAG || "").trim()),
  provider,
  requestedProvider: provider === "ebay" ? "ebay" : "unconfigured",
  siteMode: "live",
  demoMode,
  liveRefreshEnabled,
  offerCheckEnabled: liveRefreshEnabled && String(process.env.OFFER_CHECK_ENABLED || "true").trim().toLowerCase() !== "false",
  rainforestApiKey,
  bluecartApiKey,
  isProduction: isAzure,
  refreshCron: process.env.REFRESH_CRON || "15 0 * * *",
  offerCheckCron: process.env.OFFER_CHECK_CRON || "15 */6 * * *",
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: configuredKeywords.length ? configuredKeywords : defaultKeywords,
  markets,
  defaultMarket: "us",
  marketConfig,
  affiliateTagForMarket
};
