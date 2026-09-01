const { normalizeTradeItemId } = require("../productIdentity");

const TOKEN_URL = "https://api.linksynergy.com/token";
const PRODUCT_SEARCH_URL = "https://api.linksynergy.com/productsearch/1.0";
const SEARCH_CONCURRENCY = 3;

function text(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXml(value) {
  return String(value == null ? "" : value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function tag(block, name) {
  const match = String(block || "").match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return text(decodeXml(match?.[1] || ""));
}

function attribute(block, name) {
  const match = String(block || "").match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return text(decodeXml(match?.[1] || ""));
}

function itemBlocks(xml) {
  return [...String(xml || "").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
}

function number(value, fallback = null) {
  const parsed = Number(String(value == null ? "" : value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function keywordTokens(value) {
  return text(value).toLowerCase().match(/[a-z0-9]+/g) || [];
}

function matchesSearchIntent(item, keyword) {
  const searchable = `${item.productName} ${item.primaryCategory} ${item.secondaryCategory}`.toLowerCase();
  return keywordTokens(keyword).every(token => searchable.includes(token));
}

function parseProduct(block) {
  const priceBlock = String(block).match(/<price(?:\s[^>]*)?>([\s\S]*?)<\/price>/i)?.[0] || "";
  const salePriceBlock = String(block).match(/<saleprice(?:\s[^>]*)?>([\s\S]*?)<\/saleprice>/i)?.[0] || "";
  const categoryBlock = String(block).match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/i)?.[1] || "";
  return {
    mid:tag(block, "mid"),
    merchantName:tag(block, "merchantname"),
    linkId:tag(block, "linkid"),
    sku:tag(block, "sku"),
    productName:tag(block, "productname"),
    primaryCategory:tag(categoryBlock, "primary"),
    secondaryCategory:tag(categoryBlock, "secondary"),
    price:number(tag(priceBlock, "price") || tag(block, "price")),
    priceCurrency:attribute(priceBlock, "currency"),
    salePrice:number(tag(salePriceBlock, "saleprice") || tag(block, "saleprice")),
    saleCurrency:attribute(salePriceBlock, "currency"),
    upc:tag(block, "upccode"),
    shortDescription:tag(block, "short"),
    longDescription:tag(block, "long"),
    linkUrl:tag(block, "linkurl"),
    imageUrl:tag(block, "imageurl")
  };
}

function normalizeProduct(item, keyword, rank, market) {
  const salePrice = item.salePrice > 0 ? item.salePrice : null;
  const retailPrice = item.price > 0 ? item.price : null;
  const currentPrice = salePrice || retailPrice;
  const originalPrice = salePrice && retailPrice && retailPrice > salePrice ? retailPrice : null;
  const gtin = normalizeTradeItemId(item.upc);
  const sku = text(item.sku);
  return {
    external_id:text(item.linkId || sku),
    product_key:gtin ? `gtin:${gtin}` : sku ? `sku:${sku}` : "",
    gtin,
    upc:gtin,
    ean:gtin,
    model_number:"",
    mpn:"",
    brand:"",
    title:text(item.productName),
    category:text(item.secondaryCategory || item.primaryCategory || keyword),
    description:text(item.longDescription || item.shortDescription),
    rating:0,
    review_count:0,
    current_price:currentPrice,
    original_price:originalPrice,
    currency:text(item.saleCurrency || item.priceCurrency || market?.currency || "USD").toUpperCase(),
    badge:originalPrice ? "Sale" : "",
    image_url:text(item.imageUrl),
    affiliate_url:text(item.linkUrl),
    retailer_name:"Newegg",
    seller_name:"Newegg",
    seller_rating:0,
    seller_feedback_count:0,
    shipping_summary:"",
    shipping_cost:null,
    return_summary:"",
    availability:"",
    checked_at:new Date().toISOString(),
    market:market?.code || "us",
    source:"newegg",
    source_rank:rank
  };
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({length:Math.min(concurrency, items.length)}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = {status:"fulfilled", value:await worker(items[index], index)};
      } catch (reason) {
        results[index] = {status:"rejected", reason};
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function createRakutenClient({clientId, clientSecret, publisherSid, fetchImpl = global.fetch}) {
  let accessToken = "";
  let tokenExpiresAt = 0;

  async function token() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const response = await fetchImpl(TOKEN_URL, {
      method:"POST",
      headers:{
        Authorization:`Bearer ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body:new URLSearchParams({scope:String(publisherSid)}),
      signal:AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Rakuten OAuth failed: ${text(body.error_description || body.error) || `HTTP ${response.status}`}`);
    accessToken = text(body.access_token);
    if (!accessToken) throw new Error("Rakuten OAuth response did not include an access token");
    tokenExpiresAt = Date.now() + Math.max(1, number(body.expires_in, 3600) - 60) * 1000;
    return accessToken;
  }

  async function search(keyword, mid) {
    const url = new URL(PRODUCT_SEARCH_URL);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("language", "en_US");
    url.searchParams.set("max", "100");
    url.searchParams.set("pagenumber", "1");
    url.searchParams.set("mid", String(mid));
    const response = await fetchImpl(url, {
      headers:{Authorization:`Bearer ${await token()}`, Accept:"application/xml"},
      signal:AbortSignal.timeout(15000)
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Rakuten Product Search failed: HTTP ${response.status}`);
    const errorText = tag(body, "ErrorText");
    if (errorText) throw new Error(`Rakuten Product Search failed: ${errorText}`);
    return itemBlocks(body).map(parseProduct);
  }

  return {search};
}

async function searchProducts({clientId, clientSecret, publisherSid, mid = "44583", keywords, market, client, fetchImpl = global.fetch}) {
  if (!clientId || !clientSecret || !publisherSid) throw new Error("Rakuten OAuth credentials and publisher SID are required");
  if (market?.code !== "us") throw new Error(`Newegg Rakuten provider currently supports only the US market, not ${market?.code || "unknown"}`);
  if (!/^\d+$/.test(String(mid || ""))) throw new Error("RAKUTEN_NEWEGG_MID must contain digits only");
  const searchTerms = [...new Set((keywords || []).map(text).filter(Boolean))];
  if (!searchTerms.length) throw new Error("Newegg search keywords are missing");

  const rakutenClient = client || createRakutenClient({clientId, clientSecret, publisherSid, fetchImpl});
  const searches = await mapLimit(searchTerms, SEARCH_CONCURRENCY, keyword => rakutenClient.search(keyword, mid));
  const products = new Map();
  const failures = [];
  searches.forEach((result, keywordIndex) => {
    const keyword = searchTerms[keywordIndex];
    if (result.status === "rejected") {
      failures.push(`${keyword}: ${result.reason?.message || "search failed"}`);
      return;
    }
    result.value.forEach((item, itemIndex) => {
      if (!matchesSearchIntent(item, keyword)) return;
      const product = normalizeProduct(item, keyword, itemIndex + 1, market);
      if (!product.external_id || !product.title || !(product.current_price > 0) || !product.image_url || !/^https?:\/\//i.test(product.affiliate_url)) return;
      const key = product.product_key || `link:${product.external_id}`;
      const existing = products.get(key);
      if (!existing || product.current_price < existing.current_price) products.set(key, product);
    });
  });
  if (!products.size) throw new Error(`Newegg returned no usable products. ${failures.join(" | ")}`.trim());
  return [...products.values()];
}

module.exports = {
  createRakutenClient,
  matchesSearchIntent,
  normalizeProduct,
  parseProduct,
  searchProducts
};
