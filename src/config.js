require("dotenv").config();
const { codes: supportedMarketCodes, market } = require("./markets");
const { feedDefinitions } = require("./retailerCatalog");

const isAzure = Boolean(process.env.WEBSITE_SITE_NAME || process.env.WEBSITE_INSTANCE_ID);
const rainforestApiKey = String(process.env.RAINFOREST_API_KEY || "").trim();
const bluecartApiKey = String(process.env.BLUECART_API_KEY || "").trim();
const adminKey = String(process.env.ADMIN_KEY || "").trim();
const ebayVerificationToken = String(process.env.EBAY_VERIFICATION_TOKEN || "").trim();
const ebayClientId = String(process.env.EBAY_CLIENT_ID || "").trim();
const ebayClientSecret = String(process.env.EBAY_CLIENT_SECRET || "").trim();
const ebayCampaignId = String(process.env.EBAY_CAMPAIGN_ID || "").trim();
const rakutenClientId = String(process.env.RAKUTEN_CLIENT_ID || "").trim();
const rakutenClientSecret = String(process.env.RAKUTEN_CLIENT_SECRET || "").trim();
const rakutenPublisherSid = String(process.env.RAKUTEN_PUBLISHER_SID || "").trim();
const rakutenNeweggMid = String(process.env.RAKUTEN_NEWEGG_MID || "44583").trim();
const rakutenNeweggKeywords = String(process.env.RAKUTEN_NEWEGG_KEYWORDS || "graphics card,gaming laptop,mechanical keyboard,router,ssd,external hard drive,gaming headset,computer monitor,laser printer")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);
const tavusToolSecret = String(process.env.TAVUS_TOOL_SECRET || "").trim();
const tavusApiKey = String(process.env.TAVUS_API_KEY || "").trim();
const tavusPalId = String(process.env.TAVUS_PAL_ID || "p5362d6973ab").trim();
/*
 * How many shoppers may hold a private conversation with Chloe at once.
 *
 * This is not the size of the audience, and raising it is not how a Live Drop
 * reaches more people. A Tavus conversation is one paid video call per viewer,
 * so a hundred viewers would mean a hundred simultaneous calls — which is also
 * no longer one shared event. An audience is served by putting a broadcast in
 * the drop's stream_embed_url: everybody watches the same one, at no
 * per-viewer cost and with no ceiling, and BroadcastStage already prefers it
 * whenever it is set.
 *
 * So this stays a modest number. It lives in configuration only so it can be
 * matched to whatever the Tavus plan actually allows, rather than guessed at
 * in code as a bare 10.
 */
const liveHostMaxSessions = Math.max(
  1,
  Math.min(200, Number(process.env.LIVE_HOST_MAX_SESSIONS) || 10),
);
const demoMode = false;

function boundedNumber(value, fallback, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

/*
 * What the live search asks eBay for.
 *
 * These were vague — "home gadgets", "tools", "office gadgets" — and a vague
 * term returns whatever a marketplace feels like returning. A partner review
 * counted the result: 19 listings in Electronics, 20 in Tools & DIY, 7 in
 * Home & Kitchen, against 2,356 from a single gift feed, and asked why a site
 * courting Newegg and Home Depot had nothing in their aisles.
 *
 * Named product types instead of category words, because that is what people
 * search and what a marketplace can answer precisely: "cordless drill"
 * returns drills, "tools" returns a shrug. The four categories a partner looks
 * at first get real coverage; the categories that were never thin keep one
 * term each rather than losing their supply.
 */
const defaultKeywords = [
  /*
   * Consumer electronics only. Newegg searches graphics cards, gaming
   * laptops, mechanical keyboards, routers, SSDs, external drives, gaming
   * headsets, monitors and laser printers under its own list, and it brought
   * back 787 listings on its first night. Asking eBay for the same aisle
   * spends a budget that has somewhere better to go.
   */
  "wireless earbuds",
  "bluetooth speaker",
  "power bank",
  "usb c hub",
  // Home & Kitchen
  "air fryer",
  "cookware set",
  "knife set",
  "robot vacuum",
  "coffee maker",
  "cutting board",
  "food storage containers",
  "stand mixer",
  // Furniture
  "bookshelf",
  "nightstand",
  "storage cabinet",
  "accent chair",
  "coffee table",
  // Printing — HP's aisle. Newegg lists printers but not the consumables.
  "printer ink cartridge",
  // Tools & DIY
  "cordless drill",
  "screwdriver set",
  "tape measure",
  "tool bag",
  "power tool set",
  "led work light",
  "step ladder",
  // Home improvement — Home Depot's aisle.
  "smart thermostat",
  "garden hose",
  "storage shelving",
  // Office
  "paper shredder",
  "label maker",
  "desk organizer",
  "office chair",
  "printer paper",
  "filing cabinet",
  /*
   * These four were one vague word each — "pet supplies", "travel
   * accessories" — and they emptied out the moment the budget went elsewhere:
   * Pet Supplies fell from 23 listings to 2 and Travel from 17 to 3 in a
   * single night. A category word cannot compete with a named product for a
   * marketplace's attention, which is the same lesson the thin categories
   * taught, arriving from the other direction.
   */
  // Pet Supplies
  "dog bed",
  "cat tree",
  "dog harness",
  "automatic pet feeder",
  // Travel
  "carry on luggage",
  "packing cubes",
  "travel backpack",
  // Automotive
  "car floor mats",
  "dash cam",
  "car phone mount",
  // Sports & Outdoors
  "yoga mat",
  "dumbbell set",
  "camping tent"
];
const localizedDefaultKeywords = {
  fr: [
    "gadgets maison",
    "accessoires cuisine",
    "maison connectée",
    "accessoires voiture",
    "animaux de compagnie",
    "outils bricolage",
    "accessoires voyage",
    "accessoires fitness",
    "idées cadeaux"
  ],
  de: [
    "haushaltsgadgets",
    "küchengadgets",
    "smart home",
    "autozubehör",
    "tierbedarf",
    "werkzeug",
    "reisezubehör",
    "fitness zubehör",
    "geschenkideen"
  ]
};

const configuredKeywords = String(process.env.SEARCH_KEYWORDS || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

const configuredMarkets = String(process.env.SUPPORTED_MARKETS || supportedMarketCodes.join(","))
  .split(",")
  .map(value => value.trim().toLowerCase())
  .filter(value => supportedMarketCodes.includes(value));

const markets = [...new Set(configuredMarkets.length ? configuredMarkets : ["us"])];
const affiliateFeeds = feedDefinitions(process.env).filter(feed => feed.markets.some(code => markets.includes(code)));
const affiliateTagForMarket = code => String(
  process.env[`AFFILIATE_TAG_${String(code).toUpperCase()}`] ||
  (code === "us" ? process.env.AFFILIATE_TAG : "") ||
  ""
).trim();
const walmartAffiliateTemplateForMarket = code => String(
  process.env[`WALMART_AFFILIATE_URL_TEMPLATE_${String(code).toUpperCase()}`] ||
  (code === "us" ? process.env.WALMART_AFFILIATE_URL_TEMPLATE : "") ||
  ""
).trim();
const keywordsForMarket = code => {
  const configured = String(process.env[`SEARCH_KEYWORDS_${String(code).toUpperCase()}`] || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return configured.length
    ? configured
    : configuredKeywords.length
      ? configuredKeywords
      : localizedDefaultKeywords[code] || defaultKeywords;
};
const marketConfig = code => {
  const selected = market(code);
  return {
    ...selected,
    affiliateTag: affiliateTagForMarket(selected.code),
    searchKeywords: keywordsForMarket(selected.code)
  };
};

const enabledSourceIds = [];
if (ebayClientId && ebayClientSecret && /^\d{10}$/.test(ebayCampaignId)) enabledSourceIds.push("ebay");
if (rainforestApiKey && markets.some(code => affiliateTagForMarket(code))) enabledSourceIds.push("amazon");
if (bluecartApiKey && markets.some(code => walmartAffiliateTemplateForMarket(code))) enabledSourceIds.push("walmart");
if (rakutenClientId && rakutenClientSecret && rakutenPublisherSid && markets.includes("us")) enabledSourceIds.push("newegg");
for (const feed of affiliateFeeds) enabledSourceIds.push(feed.source);
const uniqueSourceIds = [...new Set(enabledSourceIds)];
const provider = uniqueSourceIds.length > 1 ? "multi" : uniqueSourceIds[0] || "unconfigured";
const liveRefreshEnabled = uniqueSourceIds.length > 0;

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
  rakutenClientId,
  rakutenClientSecret,
  rakutenPublisherSid,
  rakutenNeweggMid,
  rakutenNeweggKeywords,
  tavusToolSecret,
  tavusApiKey,
  tavusPalId,
  liveHostMaxSessions,
  ebayEnvironment: String(process.env.EBAY_ENVIRONMENT || "production").trim().toLowerCase(),
  affiliateTag: String(process.env.AFFILIATE_TAG || "").trim(),
  affiliateTagConfigured: markets.some(code => Boolean(affiliateTagForMarket(code))),
  provider,
  requestedProvider: provider,
  enabledSourceIds: uniqueSourceIds,
  affiliateFeeds,
  siteMode: "live",
  demoMode,
  liveRefreshEnabled,
  offerCheckEnabled: liveRefreshEnabled && String(process.env.OFFER_CHECK_ENABLED || "true").trim().toLowerCase() !== "false",
  rainforestApiKey,
  bluecartApiKey,
  isProduction: isAzure,
  refreshCron: process.env.REFRESH_CRON || "15 0 * * *",
  offerCheckCron: process.env.OFFER_CHECK_CRON || "45 3,9,15,21 * * *",
  /* Away from the refresh and the offer checks so the two never contend for
     the same retailer's rate limit. */
  linkHealthCron: process.env.LINK_HEALTH_CRON || "20 2 * * *",
  linkHealthBatch: Math.max(50, Math.min(2000, Number(process.env.LINK_HEALTH_BATCH) || 400)),
  timezone: process.env.TIMEZONE || "America/New_York",
  searchKeywords: configuredKeywords.length ? configuredKeywords : defaultKeywords,
  markets,
  defaultMarket: "us",
  marketConfig,
  affiliateTagForMarket,
  walmartAffiliateTemplateForMarket,
  staleOfferHours: boundedNumber(process.env.STALE_OFFER_HOURS, 48, 12),
  maxProductsPerSource: boundedNumber(process.env.MAX_PRODUCTS_PER_SOURCE, 500, 50, 2000)
};
