const https = require("https");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (response.statusCode >= 400) return reject(new Error(json.message || `HTTP ${response.statusCode}`));
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function numberValue(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object") return numberValue(value.value || value.price || value.amount);
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(item, keyword, index) {
  const itemId = item.item_id || item.us_item_id || item.product_id || item.id;
  const upc = item.upc || item.gtin || item.gtin13 || "";
  const model = item.model_number || item.model || "";
  return {
    external_id: `walmart-${itemId || `${keyword}-${index}`}`,
    product_key: upc ? `upc:${String(upc).replace(/\D/g, "")}` : model ? `model:${String(model).toLowerCase()}` : "",
    upc: String(upc),
    gtin: String(item.gtin || item.gtin13 || ""),
    model_number: String(model),
    title: item.title || item.name || item.product_title || "",
    category: keyword,
    description: item.description || item.short_description || `Popular Walmart product found for “${keyword}”.`,
    rating: numberValue(item.rating || item.customer_rating) || 0,
    review_count: numberValue(item.ratings_total || item.review_count) || 0,
    current_price: numberValue(item.price || item.current_price || item.primary_offer?.offer_price),
    original_price: numberValue(item.list_price || item.original_price || item.was_price || item.msrp),
    currency: item.currency || item.price?.currency || "USD",
    badge: item.is_best_seller ? "Best Seller" : item.badge || "",
    image_url: item.image || item.image_url || item.thumbnail || item.product_image || item.primary_image || item.images?.[0]?.link || item.images?.[0]?.url || "",
    affiliate_url: item.link || item.url || item.product_url || (itemId ? `https://www.walmart.com/ip/${itemId}` : ""),
    source: "walmart",
    source_rank: index + 1
  };
}

async function searchOne(keyword, apiKey) {
  const query = new URLSearchParams({ api_key: apiKey, type: "search", walmart_domain: "walmart.com", search_term: keyword, sort_by: "best_seller", page: "1" });
  const json = await getJson(`https://api.bluecartapi.com/request?${query}`);
  return (json.search_results || []).slice(0, 20).map((item, index) => normalize(item, keyword, index));
}

exports.searchProducts = async ({ apiKey, keywords }) => {
  if (!apiKey) throw new Error("BLUECART_API_KEY is missing");
  const all = [];
  for (const keyword of keywords) all.push(...await searchOne(keyword, apiKey));
  return all;
};
