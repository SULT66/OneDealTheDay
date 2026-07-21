const https = require("https");

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, response => {
      let body = "";

      response.on("data", chunk => {
        body += chunk;
      });

      response.on("end", () => {
        let json;

        try {
          json = JSON.parse(body);
        } catch {
          return reject(
            new Error(
              `BlueCart returned invalid JSON (HTTP ${response.statusCode}): ${body.slice(0, 300)}`
            )
          );
        }

        if (response.statusCode >= 400) {
          const message =
            json.message ||
            json.error ||
            json.request_info?.message ||
            `HTTP ${response.statusCode}`;

          const error = new Error(`BlueCart ${message}`);
          error.statusCode = response.statusCode;
          return reject(error);
        }

        resolve(json);
      });
    }).on("error", reject);
  });
}

function numberValue(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;

  if (typeof value === "object") {
    return numberValue(value.value ?? value.price ?? value.amount);
  }

  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(raw, keyword, index) {
  const item = raw.product || raw;

  const itemId =
    item.item_id ||
    item.us_item_id ||
    item.product_id ||
    item.id;

  const upc =
    item.upc ||
    item.gtin ||
    item.gtin13 ||
    "";

  const model =
    item.model_number ||
    item.model ||
    item.manufacturer_part_number ||
    "";

  const primaryOffer =
    item.primary_offer ||
    raw.primary_offer ||
    {};

  return {
    external_id: `walmart-${itemId || `${keyword}-${index}`}`,

    product_key: upc
      ? `upc:${String(upc).replace(/\D/g, "")}`
      : model
        ? `model:${String(model)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")}`
        : "",

    upc: String(upc),
    gtin: String(item.gtin || item.gtin13 || ""),
    model_number: String(model),

    title:
      item.title ||
      item.name ||
      item.product_title ||
      "",

    category: keyword,

    description:
      item.description ||
      item.short_description ||
      `Popular Walmart product found for “${keyword}”.`,

    rating:
      numberValue(
        item.rating ||
        item.customer_rating ||
        item.rating_average
      ) || 0,

    review_count:
      numberValue(
        item.ratings_total ||
        item.review_count ||
        item.rating_count
      ) || 0,

    current_price: numberValue(
      item.price ||
      item.current_price ||
      primaryOffer.offer_price ||
      primaryOffer.price
    ),

    original_price: numberValue(
      item.list_price ||
      item.original_price ||
      item.was_price ||
      item.msrp
    ),

    currency:
      item.currency ||
      item.price?.currency ||
      primaryOffer.currency ||
      "USD",

    badge:
      item.is_best_seller
        ? "Best Seller"
        : item.badge || "",

    image_url:
      item.image ||
      item.image_url ||
      item.thumbnail ||
      item.product_image ||
      item.primary_image ||
      item.images?.[0]?.link ||
      item.images?.[0]?.url ||
      "",

    affiliate_url:
      item.link ||
      item.url ||
      item.product_url ||
      (itemId
        ? `https://www.walmart.com/ip/${itemId}`
        : ""),

    source: "walmart",
    source_rank: index + 1
  };
}

async function searchOne(keyword, apiKey) {
  const query = new URLSearchParams({
    api_key: apiKey,
    type: "search",
    walmart_domain: "walmart.com",
    search_term: keyword,
    sort_by: "best_seller",
    page: "1"
  });

  const url = `https://api.bluecartapi.com/request?${query}`;

  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const json = await getJson(url);

      return (json.search_results || [])
        .slice(0, 20)
        .map((item, index) =>
          normalize(item, keyword, index)
        )
        .filter(
          item =>
            item.title &&
            item.image_url &&
            item.affiliate_url
        );
    } catch (error) {
      lastError = error;

      const retryable = [
        429,
        500,
        502,
        503,
        504
      ].includes(error.statusCode);

      if (!retryable || attempt === 3) {
        break;
      }

      await wait(attempt * 1500);
    }
  }

  throw lastError;
}

exports.searchProducts = async ({
  apiKey,
  keywords
}) => {
  if (!apiKey) {
    throw new Error("BLUECART_API_KEY is missing");
  }

  const all = [];
  const failures = [];

  for (const keyword of keywords) {
    try {
      const products = await searchOne(
        keyword,
        apiKey
      );

      all.push(...products);
    } catch (error) {
      failures.push(
        `${keyword}: ${error.message}`
      );

      console.error(
        `Walmart search failed for "${keyword}": ${error.message}`
      );
    }
  }

  if (!all.length) {
    throw new Error(
      `Walmart returned no usable products. ${failures.join(" | ")}`
    );
  }

  return all;
};
