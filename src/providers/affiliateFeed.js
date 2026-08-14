const crypto = require("crypto");
const zlib = require("zlib");

const MAX_FEED_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FEED_CACHE_TTL_MS = 10 * 60 * 1000;
const feedProductCache = new Map();

const FIELD_ALIASES = Object.freeze({
  id:["id", "sku", "product_id", "productid", "merchant_product_id", "aw_product_id", "item_id", "asin"],
  title:["title", "name", "product_name", "product_title"],
  description:["description", "product_description", "short_description", "product_short_description", "merchant_product_description"],
  category:["category", "category_name", "merchant_category", "merchant_product_category_path", "google_product_category", "product_type"],
  brand:["brand", "brand_name", "manufacturer"],
  manufacturer:["manufacturer", "manufacturer_name"],
  gtin:["gtin", "gtin13", "gtin14"],
  upc:["upc", "upc_code"],
  ean:["ean", "ean13"],
  mpn:["mpn", "manufacturer_part_number", "part_number"],
  model:["model", "model_number"],
  price:["sale_price", "current_price", "search_price", "offer_price", "price"],
  original_price:["original_price", "old_price", "regular_price", "list_price", "rrp", "rrp_price", "msrp", "price"],
  currency:["currency", "currency_code", "price_currency"],
  image_url:["image_url", "image", "image_link", "merchant_image_url", "merchant_thumb_url", "aw_thumb_url", "large_image", "large_image_url", "alternate_image", "additional_image_link", "product_image"],
  affiliate_url:["affiliate_url", "aw_deep_link", "deeplink", "deep_link", "tracking_url", "click_url", "link", "product_url", "url"],
  retailer_shop_url:["retailer_shop_url", "merchant_deep_link", "link", "product_url", "merchant_url", "store_url", "shop_url", "url"],
  source_group_id:["item_group_id", "parent_product_id", "source_parent_id", "group_id"],
  source_variant_id:["variant_id", "variantid", "source_variant_id"],
  seller_name:["seller_name", "seller", "merchant_name", "advertiser_name"],
  shipping:["shipping_summary", "shipping", "delivery", "delivery_message", "delivery_cost"],
  returns:["return_summary", "returns", "return_policy"],
  availability:["availability", "stock_status", "in_stock", "stock"],
  source_updated_at:["source_updated_at", "last_updated", "updated_at", "modified_at"],
  rating:["rating", "average_rating", "customer_rating"],
  review_count:["review_count", "reviews", "rating_count", "ratings_total"],
  badge:["badge", "promotion", "promotional_text", "product_badge", "coupon"]
});

function compactText(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(value, label) {
  if (!value) return {};
  try {
    const result = JSON.parse(value);
    if (!result || Array.isArray(result) || typeof result !== "object") throw new Error("must be an object");
    return result;
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
}

function safeFeedUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("Affiliate feed URL is invalid");
  }
  const hostname = url.hostname.toLowerCase();
  const privateHost = hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" ||
    /^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) ||
    /^169\.254\./.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
  if (url.protocol !== "https:" || privateHost || url.username || url.password) {
    throw new Error("Affiliate feed URL must be a public HTTPS URL without embedded credentials");
  }
  return url;
}

function safeHeaders(headersJson) {
  const parsed = parseJson(headersJson, "Affiliate feed headers");
  const blocked = new Set(["host", "content-length", "connection", "transfer-encoding"]);
  return Object.fromEntries(Object.entries(parsed)
    .filter(([key, value]) => !blocked.has(key.toLowerCase()) && ["string", "number", "boolean"].includes(typeof value))
    .map(([key, value]) => [key, String(value)]));
}

async function download(definition, fetchImpl = global.fetch, redirectCount = 0, signal) {
  const url = safeFeedUrl(definition.url);
  const response = await fetchImpl(url, {
    headers:{Accept:"application/json,text/csv,text/tab-separated-values,application/xml,text/xml;q=0.9,*/*;q=0.5", ...safeHeaders(definition.headersJson)},
    redirect:"manual",
    signal:signal
      ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000)
  });
  if (response.status >= 300 && response.status < 400) {
    if (redirectCount >= MAX_REDIRECTS) throw new Error("Affiliate feed redirected too many times");
    const location = response.headers.get("location");
    if (!location) throw new Error(`Affiliate feed redirect ${response.status} has no location`);
    const redirectedUrl = new URL(location, url);
    return download({
      ...definition,
      url:redirectedUrl.toString(),
      headersJson:redirectedUrl.origin === url.origin ? definition.headersJson : ""
    }, fetchImpl, redirectCount + 1, signal);
  }
  if (!response.ok) throw new Error(`Affiliate feed request failed with HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_FEED_BYTES) throw new Error("Affiliate feed exceeds the 30 MB limit");
  let buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FEED_BYTES) throw new Error("Affiliate feed exceeds the 30 MB limit");
  const hasGzipHeader = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  // Awin Create-a-Feed URLs can return a gzip body without a .gz pathname or
  // a reliable Content-Encoding header, so the file signature is authoritative.
  if (hasGzipHeader) buffer = zlib.gunzipSync(buffer);
  if (buffer.length > MAX_FEED_BYTES) throw new Error("Decompressed affiliate feed exceeds the 30 MB limit");
  return {
    body:buffer.toString("utf8").replace(/^\uFEFF/, ""),
    contentType:String(response.headers.get("content-type") || "").toLowerCase(),
    pathname:url.pathname.toLowerCase()
  };
}

function parseDelimited(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field.replace(/\r$/, ""));
  if (row.some(value => value.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows.shift().map(header => compactText(header).toLowerCase());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function parseXml(text) {
  const records = [];
  const nodes = text.match(/<(?:product|item|entry)\b[^>]*>[\s\S]*?<\/(?:product|item|entry)>/gi) || [];
  for (const node of nodes) {
    const record = {};
    const childPattern = /<([a-zA-Z_][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g;
    let match;
    while ((match = childPattern.exec(node))) {
      const key = match[1].split(":").pop().toLowerCase();
      record[key] = compactText(decodeXml(match[2]));
    }
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}

function jsonRecords(value) {
  if (Array.isArray(value)) return value;
  for (const key of ["products", "items", "data", "results", "offers"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function parseRecords(downloaded, requestedFormat = "auto") {
  const format = requestedFormat === "auto"
    ? downloaded.contentType.includes("json") || downloaded.pathname.endsWith(".json") ? "json"
      : downloaded.contentType.includes("xml") || downloaded.pathname.endsWith(".xml") ? "xml"
        : downloaded.contentType.includes("tab-separated") || downloaded.pathname.endsWith(".tsv") ? "tsv"
          : "csv"
    : requestedFormat;
  if (format === "json") return jsonRecords(JSON.parse(downloaded.body));
  if (format === "xml") return parseXml(downloaded.body);
  if (format === "tsv") return parseDelimited(downloaded.body, "\t");
  if (format === "csv") {
    const firstLine = String(downloaded.body || "").split(/\r?\n/, 1)[0] || "";
    const candidates = [",", "\t", "|"];
    const delimiter = candidates
      .map(value => ({value, count:firstLine.split(value).length - 1}))
      .sort((left, right) => right.count - left.count)[0];
    return parseDelimited(downloaded.body, delimiter?.count ? delimiter.value : ",");
  }
  throw new Error(`Unsupported affiliate feed format: ${format}`);
}

function normalizedRecord(record) {
  return Object.fromEntries(Object.entries(record || {}).map(([key, value]) => [String(key).trim().toLowerCase(), value]));
}

function field(record, map, logical) {
  const configured = map[logical];
  const keys = configured ? [configured] : FIELD_ALIASES[logical] || [];
  for (const key of keys) {
    const value = record[String(key).trim().toLowerCase()];
    if (value != null && String(value).trim() !== "") return value;
  }
  return "";
}

function numberValue(value) {
  let text = String(value == null ? "" : value).trim().replace(/[^0-9,.-]/g, "");
  if (!text) return null;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
  else text = text.replace(/,/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return /^https?:$/.test(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function productKey({gtin, upc, ean, mpn, model}) {
  const numeric = compactText(gtin || upc || ean).replace(/\D/g, "");
  if (numeric.length >= 8) return `gtin:${numeric}`;
  const part = compactText(mpn || model).toLowerCase().replace(/[^a-z0-9]/g, "");
  return part ? `model:${part}` : "";
}

function allowedByFeedPolicy(product, definition) {
  const policy = definition?.feedPolicy;
  if (!policy) return true;
  const category = compactText(product.category);
  const leaf = category.split(" > ").pop()?.trim().toLowerCase() || "";
  const categoryLeaves = Array.isArray(policy.categoryLeaves)
    ? policy.categoryLeaves.map(value => compactText(value).toLowerCase()).filter(Boolean)
    : [];
  if (categoryLeaves.length && !categoryLeaves.includes(leaf)) return false;
  const excludedCategoryLeaves = Array.isArray(policy.excludeCategoryLeaves)
    ? policy.excludeCategoryLeaves.map(value => compactText(value).toLowerCase()).filter(Boolean)
    : [];
  if (excludedCategoryLeaves.includes(leaf)) return false;
  const title = compactText(product.title).toLowerCase();
  const excludedTerms = Array.isArray(policy.excludeTitleTerms)
    ? policy.excludeTitleTerms.map(value => compactText(value).toLowerCase()).filter(Boolean)
    : [];
  return !excludedTerms.some(term => title.includes(term));
}

function searchTokens(keywords) {
  const values = Array.isArray(keywords) ? keywords : [keywords];
  return [...new Set(values
    .flatMap(value => String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || [])
    .filter(token => token.length >= 2))];
}

function searchRelevance(product, tokens) {
  if (!tokens.length) return 0;
  const searchable = value => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const title = searchable(`${product.title || ""} ${product.brand || ""} ${product.model_number || ""}`);
  const category = searchable(product.category);
  const description = searchable(product.description);
  return tokens.reduce((score, token) => score +
    (title.includes(token) ? 4 : 0) +
    (category.includes(token) ? 2 : 0) +
    (description.includes(token) ? 1 : 0), 0);
}

function normalize(record, definition, market, index, map) {
  const source = `feed-${definition.retailerId}`;
  const title = compactText(field(record, map, "title"));
  const affiliateUrl = httpUrl(field(record, map, "affiliate_url"));
  const retailerShopUrl = httpUrl(field(record, map, "retailer_shop_url"));
  const imageUrl = httpUrl(field(record, map, "image_url"));
  const currentPrice = numberValue(field(record, map, "price"));
  const originalPrice = numberValue(field(record, map, "original_price"));
  const gtin = compactText(field(record, map, "gtin"));
  const upc = compactText(field(record, map, "upc"));
  const ean = compactText(field(record, map, "ean"));
  const mpn = compactText(field(record, map, "mpn"));
  const model = compactText(field(record, map, "model"));
  const rawId = compactText(field(record, map, "id")) || crypto.createHash("sha256").update(`${affiliateUrl}|${title}`).digest("hex").slice(0, 24);
  const availabilityValue = compactText(field(record, map, "availability"));
  const availability = /^(?:0|false|no|out[ _-]?of[ _-]?stock|unavailable)$/i.test(availabilityValue) ? "Out of stock" : availabilityValue || "Available";
  return {
    external_id:rawId,
    product_key:productKey({gtin, upc, ean, mpn, model}),
    gtin,
    upc,
    ean,
    mpn,
    model_number:model || mpn,
    brand:(() => {
      const brand = compactText(field(record, map, "brand"));
      return brand && brand.toLowerCase() === String(definition.retailerName || "").toLowerCase()
        ? definition.retailerName
        : brand;
    })(),
    manufacturer:compactText(field(record, map, "manufacturer")),
    title,
    category:compactText(field(record, map, "category")) || "Featured products",
    // Merchant feeds sometimes embed complete sales-page CSS and JavaScript in
    // this field. Keep enough copy for search/editorial context without
    // turning each catalog row into a copy of the storefront page.
    description:compactText(field(record, map, "description")).slice(0, 4000),
    rating:numberValue(field(record, map, "rating")) || 0,
    review_count:Math.max(0, Math.round(numberValue(field(record, map, "review_count")) || 0)),
    current_price:currentPrice,
    original_price:originalPrice > currentPrice ? originalPrice : null,
    currency:compactText(field(record, map, "currency") || market.currency).toUpperCase(),
    badge:compactText(field(record, map, "badge")),
    image_url:imageUrl,
    affiliate_url:affiliateUrl,
    retailer_shop_url:retailerShopUrl,
    source_group_id:compactText(field(record, map, "source_group_id")),
    source_variant_id:compactText(field(record, map, "source_variant_id")),
    retailer_name:definition.retailerName,
    seller_name:compactText(field(record, map, "seller_name")) || definition.retailerName,
    shipping_summary:compactText(field(record, map, "shipping")),
    return_summary:compactText(field(record, map, "returns")),
    availability,
    source_availability:availabilityValue ? availability : null,
    source_updated_at:compactText(field(record, map, "source_updated_at")) || null,
    checked_at:new Date().toISOString(),
    market:market.code,
    source,
    source_rank:index + 1
  };
}

function awaitWithSignal(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason || new Error("Affiliate feed search aborted"));
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason || new Error("Affiliate feed search aborted"));
    signal.addEventListener("abort", abort, {once:true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function searchProducts({definition, market, keywords = [], fetchImpl = global.fetch, signal}) {
  if (!definition?.markets?.includes(market?.code)) return [];
  const useCache = fetchImpl === global.fetch;
  const cacheKey = useCache
    ? crypto.createHash("sha256").update([
        definition.id,
        market.code,
        definition.url,
        definition.format,
        definition.fieldMapJson,
        definition.headersJson,
      ].join("|")).digest("hex")
    : "";
  const now = Date.now();
  let productPromise = useCache && feedProductCache.get(cacheKey)?.expiresAt > now
    ? feedProductCache.get(cacheKey).promise
    : null;
  if (!productPromise) {
    productPromise = (async () => {
      const map = Object.fromEntries(Object.entries(parseJson(definition.fieldMapJson, "Affiliate feed field map"))
        .map(([key, value]) => [String(key).trim().toLowerCase(), String(value).trim().toLowerCase()]));
      const downloaded = await download(definition, fetchImpl, 0, signal);
      const records = parseRecords(downloaded, definition.format).map(normalizedRecord);
      const loaded = records
        .map((record, index) => normalize(record, definition, market, index, map))
        .filter(product => product.title && product.image_url && product.affiliate_url && product.current_price > 0)
        .filter(product => allowedByFeedPolicy(product, definition));
      if (!loaded.length) throw new Error(`${definition.retailerName} feed returned no usable commissionable products`);
      return loaded;
    })();
    if (useCache) {
      feedProductCache.set(cacheKey, {
        expiresAt: now + FEED_CACHE_TTL_MS,
        promise: productPromise,
      });
      productPromise.catch(() => feedProductCache.delete(cacheKey));
    }
  }
  let products = await awaitWithSignal(productPromise, signal);
  const tokens = searchTokens(keywords);
  if (tokens.length) {
    products = products
      .filter(product => !/\b(out of stock|unavailable|sold out|expired|discontinued)\b/i.test(String(product.availability || "")))
      .map(product => ({product, relevance:searchRelevance(product, tokens)}))
      .filter(entry => entry.relevance > 0)
      .sort((left, right) => right.relevance - left.relevance || left.product.source_rank - right.product.source_rank)
      .map(entry => entry.product);
  }
  const catalogLimit = Number(definition.maxProducts) > 0
    ? Math.max(50, Math.min(10000, Math.round(Number(definition.maxProducts))))
    : 2000;
  products = products.slice(0, catalogLimit);
  if (!products.length) throw new Error(`${definition.retailerName} feed returned no usable commissionable products`);
  return products;
}

module.exports = {
  download,
  allowedByFeedPolicy,
  normalize,
  parseDelimited,
  parseRecords,
  safeFeedUrl,
  searchRelevance,
  searchTokens,
  searchProducts
};
