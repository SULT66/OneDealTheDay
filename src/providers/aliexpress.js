/*
 * AliExpress, on a short leash.
 *
 * This is the one source nobody has to approve us for: the programme is
 * self-serve, the catalogue is a hundred million listings deep, and it will
 * never reject the site the way a network does. That is also the problem. A
 * catalogue filled with whatever this API returns first is a hundred million
 * listings of other people's photographs, three-week shipping and a returns
 * policy nobody wants to test — which is the opposite of the promise every
 * page here makes.
 *
 * So the filtering happens on the way in, not on the way out:
 *
 *   - ship_to_country and a delivery-days ceiling, so what we publish arrives
 *     in days rather than next month;
 *   - a seller rating floor, because evaluate_rate is the only trust signal
 *     this API gives and a listing without it has nothing behind it;
 *   - an order-volume floor, so a listing has at least been bought before it
 *     is recommended;
 *   - and a hard cap per run, because depth here is free and depth is exactly
 *     what would drown the rest of the catalogue.
 *
 * What this source cannot provide, and does not pretend to: product reviews,
 * a barcode, or a seller feedback count. That matters more than it sounds.
 * Those are three of the four things src/indexability.js looks for, so an
 * AliExpress listing stays reachable and searchable on the site and is not
 * offered to Google unless it earns it another way. That is the correct
 * outcome and it happens on its own.
 */
const crypto = require("crypto");
const { normalizeCatalogProduct } = require("../catalogTaxonomy");

const GATEWAY = "https://api-sg.aliexpress.com/sync";
const PRODUCT_QUERY = "aliexpress.affiliate.product.query";
/* The API's own ceiling. Asking for more is an error, not a bigger page. */
const MAX_PAGE_SIZE = 50;
/* One call. Ten seconds is already twice what a healthy answer takes. */
const DEFAULT_TIMEOUT_MS = 10000;
/*
 * And the whole sweep, whatever happens inside it.
 *
 * The refresh gives every source a deadline measured in tens of minutes,
 * because that is what a full eBay sweep legitimately needs. This source needs
 * seconds, so it is held to seconds: on 2026-10-09 it sat on the market's
 * entire thirty-minute budget and the run ended with every source reporting
 * failure and nothing imported. A new source must not be able to do that to a
 * working catalogue, whatever is wrong with it on the day.
 */
const SWEEP_BUDGET_MS = Number(process.env.ALIEXPRESS_SWEEP_BUDGET_MS || 120000);

/* Ten days is the line between "ordered it, forgot about it, it arrived" and a
   complaint. Items shipping from a warehouse in the destination country are
   what clears it. */
const DEFAULT_MAX_DELIVERY_DAYS = 10;
/* evaluate_rate is a positive-feedback percentage, like eBay's. 90% is low for
   a marketplace where good sellers sit above 96. */
const DEFAULT_MIN_SELLER_PERCENT = 94;
/* Something a few hundred people have bought is a product. Something nobody
   has bought is a listing. */
const DEFAULT_MIN_ORDERS = 100;
/*
 * And a price floor, off by default.
 *
 * Sorting by what sells most brings the cheapest things first: measured on the
 * first live sweep, the median price of what came back was $5.70 and three
 * quarters of it was under ten dollars. That is a real shelf and it is also a
 * different shop from the one the rest of this catalogue describes, so the
 * choice belongs to whoever owns the brand rather than to this file.
 */
const DEFAULT_MIN_PRICE = 0;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The signature the gateway expects.
 *
 * Every parameter that is being sent, including the method name, sorted by
 * key, concatenated as key then value with nothing between them, and run
 * through HMAC-SHA256 with the app secret as the key. Upper-case hex.
 *
 * Worth saying plainly because it is easy to get subtly wrong: the separators
 * are not there, the values are not URL-encoded at this stage, and `sign`
 * itself is not part of what is signed.
 */
function signParams(params, appSecret) {
  const base = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value != null && value !== "")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .reduce((accumulated, [key, value]) => accumulated + key + String(value), "");
  return crypto.createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

function requestUrl(params) {
  const query = Object.entries(params)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `${GATEWAY}?${query}`;
}

/**
 * One call, with the common parameters the gateway requires on every request.
 */
async function callApi(method, params, {
  appKey,
  appSecret,
  fetchImpl = global.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
} = {}) {
  const parameters = {
    ...params,
    method,
    app_key: appKey,
    sign_method: "sha256",
    /* Milliseconds since the epoch. The older gateway wanted a Shanghai-local
       string; this one does not, and sending that is a signature error with a
       misleading message. */
    timestamp: Date.now(),
    format: "json",
    v: "2.0",
    /* Without this the response is wrapped in another layer of envelopes. */
    simplify: true,
  };
  parameters.sign = signParams(parameters, appSecret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    /*
     * The signal asks; the race insists.
     *
     * Aborting a request only works if whatever is on the other end of fetch
     * honours the signal. A socket that accepts the connection and then says
     * nothing may not, and then the await never returns and no budget above
     * this line can help — which is how one source sat on the whole refresh
     * for half an hour. This settles either way.
     */
    const response = await Promise.race([
      fetchImpl(requestUrl(parameters), { method: "POST", signal: controller.signal }),
      new Promise((_, reject) => {
        const giveUp = setTimeout(
          () => reject(new Error(`AliExpress did not answer within ${Math.round(timeoutMs / 1000)}s`)),
          timeoutMs,
        );
        giveUp.unref?.();
      }),
    ]);
    if (!response.ok) throw new Error(`AliExpress API responded ${response.status}`);
    const body = await response.json();
    /* The gateway reports failure inside a 200. */
    if (body?.error_response) {
      const error = body.error_response;
      throw new Error(`AliExpress API error ${error.code || ""}: ${error.msg || error.sub_msg || "unknown"}`.trim());
    }
    return body;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

/* The response nests the useful part three levels down, and the key is named
   after the method. */
function productsFrom(body) {
  const envelope = body?.aliexpress_affiliate_product_query_response || body?.resp_result ? body : {};
  const result = envelope?.aliexpress_affiliate_product_query_response?.resp_result?.result
    || envelope?.resp_result?.result
    || body?.result;
  const products = result?.products?.product || result?.products;
  return Array.isArray(products) ? products : [];
}

/** A listing we would be willing to put our name next to. */
function isAcceptable(item, { minSellerPercent, minOrders, maxDeliveryDays, minPrice = 0 }) {
  const sellerPercent = number(item?.evaluate_rate, 0);
  const orders = number(item?.lastest_volume, 0);
  const days = number(item?.ship_to_days, 0);
  if (sellerPercent < minSellerPercent) return false;
  if (orders < minOrders) return false;
  /* An unknown delivery time is not a fast one. */
  if (!days || days > maxDeliveryDays) return false;
  const price = number(item?.target_sale_price, 0);
  if (price < minPrice) return false;
  return Boolean(text(item?.promotion_link) && text(item?.product_title) && price > 0);
}

function normalizeItem(item, keyword, sourceRank, market) {
  const salePrice = number(item?.target_sale_price, 0);
  const listPrice = number(item?.target_original_price, 0);
  const sellerPercent = number(item?.evaluate_rate, 0);
  const orders = number(item?.lastest_volume, 0);
  const days = number(item?.ship_to_days, 0);
  const categoryName = text(item?.second_level_category_name || item?.first_level_category_name);
  return {
    external_id: text(item?.product_id),
    /* No barcode is published by this API, so nothing here can be matched to
       the same product in another shop. See src/comparables.js. */
    product_key: "",
    gtin: "",
    upc: "",
    ean: "",
    model_number: "",
    mpn: "",
    brand: "",
    title: text(item?.product_title),
    category: keyword,
    description: [
      categoryName && `Listed under ${categoryName}.`,
      orders ? `${orders.toLocaleString("en-US")} bought recently.` : "",
      days ? `Ships to ${String(market?.code || "us").toUpperCase()} in about ${days} days.` : "",
    ].filter(Boolean).join(" "),
    /* AliExpress publishes no product review score through this API. Saying
       zero is the truth; inventing one from the seller's feedback would put a
       number on the page that nothing stands behind. */
    rating: 0,
    review_count: 0,
    current_price: salePrice,
    original_price: listPrice > salePrice ? listPrice : null,
    currency: text(item?.target_sale_price_currency || market?.currency).toUpperCase(),
    badge: "",
    image_url: text(item?.product_main_image_url),
    /* The tracked link, not the plain product URL: the plain one earns
       nothing and the API will not give us both. */
    affiliate_url: text(item?.promotion_link),
    retailer_name: "AliExpress",
    retailer_shop_url: text(item?.shop_url),
    seller_name: text(item?.shop_id ? `AliExpress seller ${item.shop_id}` : "AliExpress seller"),
    /* A percentage of positive feedback, carried onto the same five-point
       scale the rest of the catalogue uses. */
    seller_rating: sellerPercent > 0 ? Number((sellerPercent / 20).toFixed(2)) : 0,
    seller_feedback_count: 0,
    shipping_summary: days ? `Delivery in about ${days} days` : "",
    shipping_cost: null,
    return_summary: "AliExpress buyer protection",
    availability: "In stock",
    checked_at: new Date().toISOString(),
    market: market?.code || "us",
    source: "aliexpress",
    source_rank: sourceRank,
  };
}

/* The keyword rotation, same idea as eBay's: a scheduled sweep takes a slice
   rather than the whole list, so one run does not spend the day's calls. */
function keywordsForRun(keywords = [], { rotate = true, perRun = 6, now = Date.now() } = {}) {
  const list = keywords.map(text).filter(Boolean);
  if (!rotate || list.length <= perRun) return list;
  const slices = Math.ceil(list.length / perRun);
  const slice = Math.floor(now / (3 * 3600 * 1000)) % slices;
  return list.slice(slice * perRun, slice * perRun + perRun);
}

/**
 * A sweep: one search per keyword, filtered, flattened and ranked.
 *
 * Stops the moment its signal is aborted — the refresh gives every source a
 * deadline, and a source that ignores it holds the whole catalogue up.
 */
async function searchProducts({
  appKey,
  appSecret,
  trackingId,
  keywords = [],
  market = { code: "us", currency: "USD" },
  rotate = true,
  keywordsPerRun = 6,
  pageSize = 30,
  maxProducts = 120,
  maxProductsPerKeyword = Infinity,
  keywordCategories = {},
  minSellerPercent = DEFAULT_MIN_SELLER_PERCENT,
  minOrders = DEFAULT_MIN_ORDERS,
  minPrice = DEFAULT_MIN_PRICE,
  maxDeliveryDays = DEFAULT_MAX_DELIVERY_DAYS,
  budgetMs = SWEEP_BUDGET_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = global.fetch,
  signal,
} = {}) {
  if (!appKey || !appSecret || !trackingId) {
    throw new Error("AliExpress is not configured: app key, secret and tracking id are all required.");
  }
  if (maxProducts <= 0 || maxProductsPerKeyword <= 0) return [];
  const terms = keywordsForRun(keywords, { rotate, perRun: keywordsPerRun });
  const country = String(market?.code || "us").toUpperCase();
  const collected = [];
  const seen = new Set();
  /* The sweep's own clock, independent of the deadline the refresh sets. */
  const expiresAt = Date.now() + budgetMs;
  let firstFailure = null;
  let attempted = 0;

  for (const keyword of terms) {
    if (signal?.aborted) break;
    /* Out of time: hand back what has been gathered rather than spending the
       catalogue's budget on the rest of the list. */
    if (Date.now() >= expiresAt) break;
    attempted += 1;
    let body;
    try {
      body = await callApi(PRODUCT_QUERY, {
      keywords: keyword,
      tracking_id: trackingId,
      page_no: 1,
      page_size: Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize)),
      target_currency: String(market?.currency || "USD").toUpperCase(),
      target_language: "EN",
      ship_to_country: country,
      /* Asked for at the source as well as filtered below: a narrower request
         spends the same call on better rows. */
      delivery_days: String(maxDeliveryDays),
        sort: "LAST_VOLUME_DESC",
      }, {
        appKey,
        appSecret,
        fetchImpl,
        signal,
        /* Never longer than what is left of the sweep. */
        timeoutMs: Math.max(1000, Math.min(timeoutMs, expiresAt - Date.now())),
      });
    } catch (error) {
      /* One keyword that fails is one keyword. The next one may be fine, and
         a source that returns five of six shelves is worth more than one that
         returns none because the sixth timed out. */
      firstFailure = firstFailure || error;
      continue;
    }

    let acceptedForKeyword = 0;
    for (const item of productsFrom(body)) {
      if (!isAcceptable(item, { minSellerPercent, minOrders, maxDeliveryDays, minPrice })) continue;
      const id = text(item?.product_id);
      if (!id || seen.has(id)) continue;
      const product = normalizeItem(item, keyword, collected.length + 1, market);
      const targetCategory = keywordCategories[keyword];
      const titleCategory = normalizeCatalogProduct({...product, category:""}).normalized_category;
      if (targetCategory && titleCategory !== "Other Deals" && titleCategory !== targetCategory) continue;
      const inferredCategory = normalizeCatalogProduct(product).normalized_category;
      if (targetCategory && inferredCategory !== "Other Deals" && inferredCategory !== targetCategory) continue;
      // The shelf is the search context, while taxonomy still checks the
      // actual title and rejects a result that belongs to another shelf.
      if (targetCategory) product.category = targetCategory;
      if (targetCategory && normalizeCatalogProduct(product).normalized_category !== targetCategory) continue;
      seen.add(id);
      collected.push(product);
      acceptedForKeyword += 1;
      if (collected.length >= maxProducts) return collected;
      if (acceptedForKeyword >= maxProductsPerKeyword) break;
    }
  }
  /*
   * Nothing at all, and every attempt failed: say why. A source that reports
   * "no products" when it actually could not reach the API sends whoever reads
   * the run looking in the wrong place.
   */
  if (!collected.length && firstFailure && attempted) throw firstFailure;
  return collected;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  SWEEP_BUDGET_MS,
  DEFAULT_MAX_DELIVERY_DAYS,
  DEFAULT_MIN_ORDERS,
  DEFAULT_MIN_PRICE,
  DEFAULT_MIN_SELLER_PERCENT,
  GATEWAY,
  isAcceptable,
  keywordsForRun,
  normalizeItem,
  productsFrom,
  searchProducts,
  signParams,
};
