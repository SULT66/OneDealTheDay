const { marketPath } = require("./markets");

const normalizeToken = (value, allowed, fallback) => {
  const token = String(value || "").trim().toLowerCase();
  return allowed.has(token) ? token : fallback;
};

const SOURCE_PAGES = new Set(["home", "product", "search", "category", "brand", "archive", "related", "unknown"]);
const PLACEMENTS = new Set([
  "featured_cta",
  "daily_card_cta",
  "product_cta",
  "shop_all",
  "featured_media",
  "featured_title",
  "daily_card_media",
  "daily_card_title",
  "collection_media",
  "collection_title",
  "collection_details",
  "catalog_media",
  "catalog_title",
  "catalog_details",
  "archive_media",
  "archive_title",
  "archive_details",
  "search_suggestion",
  "unknown"
]);
const ACTIONS = new Set(["view_details", "view_deal", "shop_all"]);

function normalizeSourcePage(value) {
  return normalizeToken(value, SOURCE_PAGES, "unknown");
}

function normalizePlacement(value) {
  return normalizeToken(value, PLACEMENTS, "unknown");
}

function normalizeAction(value) {
  return normalizeToken(value, ACTIONS, "view_deal");
}

function outboundPath(product, { sourcePage = "unknown", placement = "unknown", action = "view_deal" } = {}) {
  const query = new URLSearchParams({
    source: normalizeSourcePage(sourcePage),
    placement: normalizePlacement(placement),
    action: normalizeAction(action)
  });
  return `${marketPath(product.market || "us", `/go/${product.id}`)}?${query.toString()}`;
}

function retailerShopUrl(product) {
  let shopUrl;
  try {
    shopUrl = new URL(String(product?.retailer_shop_url || ""));
  } catch {
    return "";
  }
  return /^https?:$/.test(shopUrl.protocol) ? shopUrl.toString() : "";
}

module.exports = {
  normalizeAction,
  normalizePlacement,
  normalizeSourcePage,
  outboundPath,
  retailerShopUrl
};
