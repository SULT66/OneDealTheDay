require("dotenv").config();

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);

const config = {
  port: Number(process.env.PORT || 8088),
  adminKey: process.env.ADMIN_KEY || "change-this-private-key",
  affiliateTag: process.env.AFFILIATE_TAG || "YOURTAG-20",
  provider: process.env.PRODUCT_PROVIDER || (isAzure ? "multi" : "demo"),
  rainforestApiKey: process.env.RAINFOREST_API_KEY || "",
  bluecartApiKey: process.env.BLUECART_API_KEY || "",
  refreshCron: process.env.REFRESH_CRON || "15 6 * * *",
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: (process.env.SEARCH_KEYWORDS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean)
};

module.exports = config;

if (isAzure && config.provider !== "demo") {
  setImmediate(() => {
    require("./catalogRecovery")(config).catch(error => {
      console.error(`Production catalog recovery error: ${error.message}`);
    });
  });
}
