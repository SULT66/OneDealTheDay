require("dotenv").config();

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const rainforestApiKey = process.env.RAINFOREST_API_KEY || "";
const bluecartApiKey = process.env.BLUECART_API_KEY || "";
const requestedProvider = String(process.env.PRODUCT_PROVIDER || "").trim().toLowerCase();

function resolveProvider() {
  if (requestedProvider === "multi") {
    if (rainforestApiKey && bluecartApiKey) return "multi";
    if (rainforestApiKey) return "rainforest";
    return "demo";
  }
  if (requestedProvider === "rainforest") return rainforestApiKey ? "rainforest" : "demo";
  if (requestedProvider && requestedProvider !== "auto") return requestedProvider;
  if (rainforestApiKey && bluecartApiKey) return "multi";
  if (rainforestApiKey) return "rainforest";
  return "demo";
}

module.exports = {
  port: Number(process.env.PORT || 8088),
  adminKey: process.env.ADMIN_KEY || "change-this-private-key",
  affiliateTag: process.env.AFFILIATE_TAG || "YOURTAG-20",
  provider: resolveProvider(),
  requestedProvider: requestedProvider || (isAzure ? "auto" : "demo"),
  rainforestApiKey,
  bluecartApiKey,
  refreshCron: process.env.REFRESH_CRON || "15 6 * * *",
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: (process.env.SEARCH_KEYWORDS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
};
