const DEFAULT_DETAIL_LIMIT = 80;
const DEFAULT_TARGET_ELIGIBLE = 40;
const SEARCH_CONCURRENCY = 3;
const DETAIL_CONCURRENCY = 6;

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

function createEbayClient({clientId, clientSecret, campaignId, environment = "production", fetchImpl = global.fetch}) {
  const production = String(environment).toLowerCase() !== "sandbox";
  const apiOrigin = production ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
  let accessToken = "";
  let tokenExpiresAt = 0;

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
      signal:AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`eBay OAuth failed: ${apiMessage(body, response.status)}`);
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
      signal:AbortSignal.timeout(10000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`eBay Browse API failed: ${apiMessage(body, response.status)}`);
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
  const gtin = text(item?.gtin);
  const epid = text(item?.epid);
  const mpn = text(item?.mpn);
  const productKey = gtin ? `gtin:${gtin}` : epid ? `epid:${epid}` : mpn ? `mpn:${mpn.toLowerCase()}` : "";
  return {
    external_id:text(item?.itemId),
    product_key:productKey,
    gtin,
    upc:/^\d{12}$/.test(gtin) ? gtin : "",
    ean:/^\d{13}$/.test(gtin) ? gtin : "",
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
  fetchImpl = global.fetch,
  detailLimit = DEFAULT_DETAIL_LIMIT,
  targetEligible = DEFAULT_TARGET_ELIGIBLE
}) {
  if (!clientId || !clientSecret) throw new Error("eBay Production credentials are missing");
  if (!/^\d{10}$/.test(String(campaignId || ""))) throw new Error("EBAY_CAMPAIGN_ID must contain exactly 10 digits");
  if (!market?.ebayMarketplaceId) throw new Error(`Unsupported eBay market: ${market?.code || "unknown"}`);
  const searchTerms = [...new Set((keywords || []).map(text).filter(Boolean))];
  if (!searchTerms.length) throw new Error("eBay search keywords are missing");

  const client = createEbayClient({clientId, clientSecret, campaignId, environment, fetchImpl});
  const searches = await mapLimit(searchTerms, SEARCH_CONCURRENCY, (keyword) => client.search(keyword, market));
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
  const maximumDetails = Math.min(queue.length, positiveInteger(detailLimit, DEFAULT_DETAIL_LIMIT), 100);
  const eligibleTarget = Math.min(60, positiveInteger(targetEligible, DEFAULT_TARGET_ELIGIBLE));
  const products = [];

  for (let offset = 0; offset < maximumDetails && products.length < eligibleTarget; offset += DETAIL_CONCURRENCY) {
    const batch = queue.slice(offset, Math.min(offset + DETAIL_CONCURRENCY, maximumDetails));
    const details = await mapLimit(batch, DETAIL_CONCURRENCY, candidate => client.getItem(candidate.item.itemId, market));
    details.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
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
  }

  if (!products.length) throw new Error("eBay returned no products with sufficient product-review or established-seller evidence");
  return products;
}

module.exports = {
  candidateIsUsable,
  createEbayClient,
  hasTrustEvidence,
  normalizeItem,
  searchProducts
};
