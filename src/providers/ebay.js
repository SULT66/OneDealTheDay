/*
 * eBay's Browse API sells us a fixed number of calls a day, and a run spends
 * one per search term plus one per item it looks at in detail. Asking for 48
 * terms and 220 detail lookups in every market meant a single sweep of the
 * five markets cost well over a thousand calls; with a sweep also firing after
 * every deploy, the day's allowance was gone by half past midnight and every
 * market went dark with "The request limit has been reached for the resource."
 *
 * The budget below is what one run may spend. Coverage does not come from
 * spending more in one run: a product stays in the catalogue for 48 hours
 * after it was last seen, so runs accumulate. Asking for all 48 terms every
 * time also bought less than it looked like — the same high-scoring listings
 * won the detail budget each run, which is why eBay sat at 265 products no
 * matter how high the ceiling went.
 */
const DEFAULT_DETAIL_LIMIT = 90;
const DEFAULT_TARGET_ELIGIBLE = 60;
const SEARCH_CONCURRENCY = 3;
/* Ten rather than six: the same coverage in less wall time, which is the
   scarce thing in a nightly run. */
const DETAIL_CONCURRENCY = 10;

/* A slice of the keyword list per run, a different slice every three hours.
   Every term still gets its turn within a morning, and the categories that
   used to lose the detail budget to louder ones now get a run to themselves. */
const KEYWORDS_PER_RUN = 16;
const ROTATION_PERIOD_MS = 3 * 60 * 60 * 1000;

const { normalizeTradeItemId } = require("../productIdentity");

/*
 * Which slice of a long keyword list this run takes.
 *
 * Only the broad scheduled list rotates. A shopper's own query is never
 * shortened — searchProducts rotates solely when the caller asked it to, and
 * the assistant never does.
 */
function keywordsForRun(terms, perRun = KEYWORDS_PER_RUN, now = Date.now()) {
  if (!Array.isArray(terms) || terms.length <= perRun) return terms;
  const windows = Math.ceil(terms.length / perRun);
  const offset = (Math.floor(now / ROTATION_PERIOD_MS) % windows) * perRun;
  return [...terms.slice(offset), ...terms.slice(0, offset)].slice(0, perRun);
}

/*
 * eBay reports an exhausted allowance per call, so a run that keeps going
 * after the first one asks another 250 questions it already knows the answer
 * to — and reports the refusal 48 times over. Recognising it lets the run stop
 * and say the one thing that is true.
 */
function isQuotaError(reason) {
  if (reason?.status === 429) return true;
  return /request limit|rate limit|call limit|too many requests|exceeded the number/i.test(
    String(reason?.message || ""),
  );
}

function text(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value, fallback = null) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") value = value.value ?? value.amount ?? value.price;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function apiMessage(body, status) {
  return text(body?.errors?.[0]?.longMessage || body?.errors?.[0]?.message || body?.message) || `HTTP ${status}`;
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({length: Math.min(concurrency, items.length)}, async () => {
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

function createEbayClient({clientId, clientSecret, campaignId, environment = "production", fetchImpl = global.fetch, signal}) {
  const production = String(environment).toLowerCase() !== "sandbox";
  const apiOrigin = production ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
  let accessToken = "";
  let tokenExpiresAt = 0;

  /* Each call keeps its own ten second timeout, and also gives up the moment
     the refresh that asked for it has stopped waiting. Without this a source
     that missed its deadline carried on calling eBay in the background, on an
     allowance the next run still needed. */
  const deadline = (ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

  async function token() {
    if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
    const response = await fetchImpl(`${apiOrigin}/identity/v1/oauth2/token`, {
      method:"POST",
      headers:{
        Authorization:`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type":"application/x-www-form-urlencoded"
      },
      body:new URLSearchParams({
        grant_type:"client_credentials",
        scope:"https://api.ebay.com/oauth/api_scope"
      }),
      signal:deadline(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`eBay OAuth failed: ${apiMessage(body, response.status)}`);
      error.status = response.status;
      throw error;
    }
    accessToken = text(body.access_token);
    if (!accessToken) throw new Error("eBay OAuth response did not include an access token");
    tokenExpiresAt = Date.now() + Math.max(1, number(body.expires_in, 7200) - 60) * 1000;
    return accessToken;
  }

  async function request(path, market, query = null) {
    if (!market?.ebayMarketplaceId) throw new Error(`eBay marketplace is missing for ${market?.code || "unknown market"}`);
    const url = new URL(`${apiOrigin}${path}`);
    if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, {
      headers:{
        Authorization:`Bearer ${await token()}`,
        Accept:"application/json",
        "Accept-Language":market.locale || "en-US",
        "X-EBAY-C-MARKETPLACE-ID":market.ebayMarketplaceId,
        "X-EBAY-C-ENDUSERCTX":`affiliateCampaignId=${campaignId},affiliateReferenceId=odd-${market.code}`
      },
      signal:deadline(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`eBay Browse API failed: ${apiMessage(body, response.status)}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  return {
    async search(keyword, market) {
      const body = await request("/buy/browse/v1/item_summary/search", market, {
        q:keyword,
        limit:"20",
        fieldgroups:"EXTENDED",
        filter:`buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:${market.countryCodes?.[0] || "US"}`
      });
      return Array.isArray(body.itemSummaries) ? body.itemSummaries : [];
    },
    getItem(itemId, market) {
      return request(`/buy/browse/v1/item/${encodeURIComponent(itemId)}`, market);
    }
  };
}

function imageUrl(item) {
  return text(item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || item?.additionalImages?.[0]?.imageUrl);
}

function listingAvailable(item) {
  const end = Date.parse(item?.itemEndDate || "");
  if (Number.isFinite(end) && end <= Date.now()) return false;
  const status = text(item?.estimatedAvailabilities?.[0]?.estimatedAvailabilityStatus).toUpperCase();
  return !status.includes("OUT_OF_STOCK") && !status.includes("UNAVAILABLE");
}

function candidateIsUsable(item) {
  const buyingOptions = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
  const condition = text(item?.condition).toLowerCase();
  return Boolean(
    item?.itemId &&
    item?.title &&
    imageUrl(item) &&
    text(item?.itemAffiliateWebUrl).startsWith("http") &&
    number(item?.price) > 0 &&
    buyingOptions.includes("FIXED_PRICE") &&
    (String(item?.conditionId || "") === "1000" || /^new\b/.test(condition)) &&
    !item?.adultOnly &&
    listingAvailable(item)
  );
}

function candidateScore(item, sourceRank) {
  const discount = number(item?.marketingPrice?.discountPercentage, 0);
  const feedback = number(item?.seller?.feedbackPercentage, 0);
  const feedbackCount = number(item?.seller?.feedbackScore, 0);
  return (item?.epid ? 25 : 0) +
    (item?.topRatedBuyingExperience ? 20 : 0) +
    Math.min(30, Math.max(0, discount)) +
    Math.max(0, Math.min(15, feedback - 85)) +
    Math.min(10, Math.log10(feedbackCount + 1) * 2) +
    Math.max(0, 10 - sourceRank / 2);
}

function shippingSummary(item) {
  const options = Array.isArray(item?.shippingOptions) ? item.shippingOptions : [];
  const available = options
    .map(option => ({option, cost:number(option?.shippingCost)}))
    .filter(entry => entry.cost != null)
    .sort((left, right) => left.cost - right.cost);
  if (!available.length) return item?.topRatedBuyingExperience ? "Ships in 1 business day with tracking" : "";
  const {option, cost} = available[0];
  const currency = text(option?.shippingCost?.currency);
  const price = cost === 0 ? "Free shipping" : `${currency} ${cost.toFixed(2)} shipping`;
  const service = text(option?.shippingServiceCode);
  return service ? `${price} via ${service}` : price;
}

function shippingCost(item) {
  const options = Array.isArray(item?.shippingOptions) ? item.shippingOptions : [];
  const costs = options.map(option => number(option?.shippingCost)).filter(value => value != null && value >= 0);
  return costs.length ? Math.min(...costs) : null;
}

function returnSummary(item) {
  const terms = item?.returnTerms;
  if (!terms) return item?.topRatedBuyingExperience ? "Minimum 30-day money-back returns" : "";
  if (terms.returnsAccepted === false) return "Returns not accepted";
  if (terms.returnsAccepted !== true) return "";
  const duration = terms.returnPeriod || {};
  const value = positiveInteger(duration.value, 0);
  const unit = text(duration.unit).toLowerCase().replace(/_/g, " ").replace(/s$/, "");
  const period = value ? `${value} ${unit || "day"}${value === 1 ? "" : "s"}` : "Returns accepted";
  return terms.returnShippingCostPayer === "SELLER" ? `${period}, seller-paid return shipping` : period;
}

function badge(item) {
  if (item?.topRatedBuyingExperience) return "Top Rated Plus";
  const discount = Math.round(number(item?.marketingPrice?.discountPercentage, 0));
  if (discount > 0) return `${discount}% off`;
  if (item?.availableCoupons) return "Coupon available";
  return "";
}

function normalizeItem(item, keyword, sourceRank, market) {
  const review = item?.primaryProductReviewRating || {};
  const originalPrice = number(item?.marketingPrice?.originalPrice);
  const currentPrice = number(item?.price);
  const sellerFeedback = number(item?.seller?.feedbackPercentage, 0);
  const gtin = normalizeTradeItemId(item?.gtin);
  const epid = text(item?.epid);
  const mpn = text(item?.mpn);
  const productKey = gtin ? `gtin:${gtin}` : epid ? `epid:${epid}` : "";
  return {
    external_id:text(item?.itemId),
    product_key:productKey,
    gtin,
    upc:gtin,
    ean:gtin,
    model_number:mpn,
    mpn,
    brand:text(item?.brand),
    title:text(item?.title),
    category:keyword,
    description:text(item?.shortDescription || item?.subtitle || `${item?.condition || "New"} item listed on eBay.`),
    rating:number(review.averageRating, 0),
    review_count:Math.round(number(review.reviewCount, 0)),
    current_price:currentPrice,
    original_price:originalPrice > currentPrice ? originalPrice : null,
    currency:text(item?.price?.currency || market?.currency).toUpperCase(),
    badge:badge(item),
    image_url:imageUrl(item),
    affiliate_url:text(item?.itemAffiliateWebUrl),
    retailer_name:"eBay",
    seller_name:text(item?.seller?.username),
    seller_rating:sellerFeedback > 0 ? sellerFeedback / 20 : 0,
    seller_feedback_count:Math.round(number(item?.seller?.feedbackScore, 0)),
    shipping_summary:shippingSummary(item),
    shipping_cost:shippingCost(item),
    return_summary:returnSummary(item),
    availability:listingAvailable(item) ? "In stock" : "Out of stock",
    checked_at:new Date().toISOString(),
    market:market?.code || "us",
    source:"ebay",
    source_rank:sourceRank
  };
}

function hasTrustEvidence(product) {
  const reviewedProduct = product.rating >= 4 && product.review_count >= 25;
  const establishedSeller = product.seller_rating >= 4.8 && product.seller_feedback_count >= 100;
  return reviewedProduct || establishedSeller;
}

async function searchProducts({
  clientId,
  clientSecret,
  campaignId,
  environment = "production",
  keywords,
  market,
  client,
  fetchImpl = global.fetch,
  detailLimit = DEFAULT_DETAIL_LIMIT,
  targetEligible = DEFAULT_TARGET_ELIGIBLE,
  rotate = false,
  signal
}) {
  if (!clientId || !clientSecret) throw new Error("eBay Production credentials are missing");
  if (!/^\d{10}$/.test(String(campaignId || ""))) throw new Error("EBAY_CAMPAIGN_ID must contain exactly 10 digits");
  if (!market?.ebayMarketplaceId) throw new Error(`Unsupported eBay market: ${market?.code || "unknown"}`);
  const allTerms = [...new Set((keywords || []).map(text).filter(Boolean))];
  if (!allTerms.length) throw new Error("eBay search keywords are missing");
  const searchTerms = rotate ? keywordsForRun(allTerms) : allTerms;

  const ebayClient = client || createEbayClient({clientId, clientSecret, campaignId, environment, fetchImpl, signal});

  let quotaExhausted = null;
  const searches = await mapLimit(searchTerms, SEARCH_CONCURRENCY, async (keyword) => {
    if (quotaExhausted) throw quotaExhausted;
    try {
      return await ebayClient.search(keyword, market);
    } catch (reason) {
      if (isQuotaError(reason)) quotaExhausted = reason;
      throw reason;
    }
  });
  if (quotaExhausted) {
    throw new Error(
      `eBay has no calls left in its daily allowance (${quotaExhausted.message}) ` +
      "Listings already in the catalogue stay until the allowance resets.",
    );
  }
  const candidates = new Map();
  const failures = [];
  searches.forEach((result, keywordIndex) => {
    if (result.status === "rejected") {
      failures.push(`${searchTerms[keywordIndex]}: ${result.reason?.message || "search failed"}`);
      return;
    }
    result.value.forEach((item, itemIndex) => {
      if (!candidateIsUsable(item)) return;
      // Search categories are peers. Penalizing every later category made a
      // strong item rank lower solely because its category ran later.
      const sourceRank = itemIndex + 1;
      const candidate = {
        item,
        keyword:searchTerms[keywordIndex],
        sourceRank,
        candidateScore:candidateScore(item, sourceRank)
      };
      const existing = candidates.get(item.itemId);
      if (!existing || candidate.candidateScore > existing.candidateScore) candidates.set(item.itemId, candidate);
    });
  });
  if (!candidates.size) throw new Error(`eBay returned no commissionable new fixed-price items. ${failures.join(" | ")}`.trim());

  const queue = [...candidates.values()].sort((left, right) => right.candidateScore - left.candidateScore);
  const maximumDetails = Math.min(queue.length, positiveInteger(detailLimit, DEFAULT_DETAIL_LIMIT), 260);
  /* Sixty was the real limit on how many products this site could hold from
     eBay, and nothing said so. A run refreshes what it can, anything it does
     not touch ages out after 48 hours, so the catalogue settles at roughly
     one run of eligible items. Sixty across every category is why Electronics
     sat at ten while Gifts sat at two thousand. */
  const eligibleTarget = Math.min(140, positiveInteger(targetEligible, DEFAULT_TARGET_ELIGIBLE));
  const products = [];

  for (let offset = 0; offset < maximumDetails && products.length < eligibleTarget; offset += DETAIL_CONCURRENCY) {
    if (signal?.aborted) break;
    const batch = queue.slice(offset, Math.min(offset + DETAIL_CONCURRENCY, maximumDetails));
    const details = await mapLimit(batch, DETAIL_CONCURRENCY, candidate => ebayClient.getItem(candidate.item.itemId, market));
    details.forEach((result, index) => {
      if (result.status !== "fulfilled") {
        if (isQuotaError(result.reason)) quotaExhausted = result.reason;
        return;
      }
      const candidate = batch[index];
      const merged = {
        ...candidate.item,
        ...result.value,
        seller:{...candidate.item?.seller, ...result.value?.seller}
      };
      const product = normalizeItem(merged, candidate.keyword, candidate.sourceRank, market);
      if (hasTrustEvidence(product) && product.current_price > 0 && product.affiliate_url && product.image_url && listingAvailable(merged)) {
        products.push(product);
      }
    });
    /* Once the allowance is gone every further lookup is a refusal. Keep what
       this run already gathered rather than spending the next run's calls on
       questions eBay will not answer. */
    if (quotaExhausted) break;
  }

  if (!products.length) {
    if (quotaExhausted) {
      throw new Error(
        `eBay has no calls left in its daily allowance (${quotaExhausted.message}) ` +
        "Listings already in the catalogue stay until the allowance resets.",
      );
    }
    throw new Error("eBay returned no products with sufficient product-review or established-seller evidence");
  }
  return products;
}

module.exports = {
  candidateIsUsable,
  createEbayClient,
  hasTrustEvidence,
  isQuotaError,
  keywordsForRun,
  normalizeItem,
  searchProducts
};
