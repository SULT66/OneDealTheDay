const https = require("https");

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let body = "";
      response.on("data", chunk => {
        body += chunk;
      });
      response.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (response.statusCode >= 400) {
            return reject(new Error(json.message || `HTTP ${response.statusCode}`));
          }
          resolve(json);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function compactText(value, depth = 0) {
  if (value == null || depth > 3) return "";
  if (typeof value === "string") return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (["number", "bigint", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) {
    return value.map(entry => compactText(entry, depth + 1)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    for (const key of ["text", "message", "label", "name", "display_name", "raw", "value", "title"]) {
      const text = compactText(value[key], depth + 1);
      if (text) return text;
    }
  }
  return "";
}

async function searchOne(keyword, apiKey, affiliateTag, market) {
  const amazonDomain = market?.amazonDomain || "amazon.com";
  const query = new URLSearchParams({
    api_key: apiKey,
    type: "search",
    amazon_domain: amazonDomain,
    search_term: keyword,
    sort_by: "featured",
    page: "1"
  });
  const json = await getJson(`https://api.rainforestapi.com/request?${query}`);

  return (json.search_results || []).slice(0, 20).map((item, index) => {
    const buybox = item.buybox_winner || {};
    const sellerName = compactText(item.seller || item.seller_name || buybox.seller) || "Amazon";
    const shippingSummary = compactText(item.delivery || item.shipping || buybox.delivery)
      || (item.is_prime ? "Prime shipping available" : "");
    const returnSummary = compactText(item.return_policy || buybox.return_policy);
    const availability = compactText(item.availability || buybox.availability)
      || (item.price ? "In stock" : "");

    return {
      external_id: item.asin,
      title: item.title,
      category: keyword,
      description: `Popular product found for “${keyword}”.`,
      rating: item.rating || 0,
      review_count: item.ratings_total || 0,
      current_price: item.price?.value ?? null,
      original_price: item.rrp?.value ?? null,
      currency: item.price?.currency || market?.currency || "USD",
      badge: item.is_best_seller ? "Best Seller" : item.is_amazon_choice ? "Amazon's Choice" : "",
      image_url: item.image,
      affiliate_url: `https://www.${amazonDomain}/dp/${item.asin}?tag=${encodeURIComponent(affiliateTag)}`,
      retailer_name: "Amazon",
      seller_name: sellerName,
      shipping_summary: shippingSummary,
      return_summary: returnSummary,
      availability,
      checked_at: new Date().toISOString(),
      market: market?.code || "us",
      source: "amazon",
      source_rank: index + 1
    };
  });
}

exports.searchProducts = async ({ apiKey, affiliateTag, keywords, market }) => {
  if (!apiKey) throw new Error("RAINFOREST_API_KEY is missing");
  if (!affiliateTag) throw new Error(`Amazon affiliate tag is missing for ${market?.code || "us"}`);
  const all = [];
  for (const keyword of keywords) {
    all.push(...await searchOne(keyword, apiKey, affiliateTag, market));
  }
  return all;
};
