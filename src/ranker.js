function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function retailer(product) {
  const source = String(product.source || "").toLowerCase();
  if (source.includes("walmart") || source.includes("bluecart")) return "walmart";
  if (source.includes("amazon") || source.includes("rainforest")) return "amazon";
  return source || "other";
}

function normalizedTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(newest|new|renewed|refurbished|amazon|walmart|exclusive)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function exactMatchKey(product) {
  const value =
    product.product_key ||
    product.gtin ||
    product.upc ||
    product.ean ||
    product.model_number ||
    product.model;
  return value ? String(value).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

const SCORE_MODEL = "current-offer-v2";

function median(values) {
  const sorted = values.map(value => number(value, NaN)).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function addCurrentOfferComparisons(items) {
  const groups = new Map();
  for (const product of items) {
    const key = exactMatchKey(product);
    const currency = String(product.currency || "").toUpperCase();
    const price = number(product.current_price);
    if (!key || !currency || price <= 0) continue;
    const groupKey = `${currency}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(price);
  }

  return items.map(product => {
    const key = exactMatchKey(product);
    const currency = String(product.currency || "").toUpperCase();
    const prices = groups.get(`${currency}:${key}`) || [];
    return prices.length >= 2
      ? {...product, comparable_offer_count:prices.length, comparable_median_price:median(prices)}
      : product;
  });
}

function isDemo(product) {
  return String(product.source || "").toLowerCase() === "demo";
}

function isAvailable(product) {
  return !/\b(out of stock|unavailable|sold out|expired|discontinued)\b/i.test(String(product.availability || ""));
}

function isEligible(product, options = {}) {
  if (!product?.title || !product?.image_url) return false;
  if (isDemo(product)) return true;
  if (!/^https?:\/\//i.test(String(product.affiliate_url || ""))) return false;
  if (!isAvailable(product)) return false;
  if (number(product.current_price) <= 0) return false;
  if (number(product.rating) < number(options.minimumRating, 3.8)) return false;
  if (number(product.review_count) < number(options.minimumReviews, 25)) return false;
  if (options.currency && String(product.currency || "").toUpperCase() !== String(options.currency).toUpperCase()) return false;
  return true;
}

function priceScore(product) {
  const current = number(product.current_price);
  if (current <= 0) return 0;
  const comparableCount = number(product.comparable_offer_count);
  const comparableMedian = number(product.comparable_median_price);
  const listReference = number(product.original_price);
  const verifiedDiscount = listReference > current ? (listReference - current) / listReference : 0;
  const referenceScore = verifiedDiscount > 0 ? 20 + clamp(verifiedDiscount / 0.4) * 6 : 20;
  if (comparableCount < 2 || comparableMedian <= 0) return referenceScore;

  // A median of current matching offers is the primary price signal. At the
  // market median an offer is neutral (20/30); a lower live price earns more.
  const marketAdvantage = (comparableMedian - current) / comparableMedian;
  const marketScore = clamp(20 + marketAdvantage * 40, 5, 30);
  return Math.max(referenceScore, marketScore);
}

function productQualityScore(product) {
  const rating = number(product.rating);
  if (rating <= 0) return 13;
  const ratingPoints = 10 + clamp((rating - 3.8) / 1.2) * 10;
  return Math.min(20, ratingPoints);
}

function reviewConfidenceScore(product) {
  const reviews = number(product.review_count);
  if (reviews <= 0) return 9;
  const volume = clamp(Math.log10(reviews + 1) / 4) * 6;
  const ratingSupport = number(product.rating) >= 4.2 ? 3 : 0;
  return Math.min(15, 6 + volume + ratingSupport);
}

function sellerScore(product) {
  const knownRetailer = ["amazon", "walmart"].includes(retailer(product)) || Boolean(String(product.retailer_name || "").trim());
  const seller = String(product.seller_name || "").trim();
  const sellerRating = number(product.seller_rating);
  return (knownRetailer ? 6 : 0) +
    (seller ? 4 : 0) +
    (isAvailable(product) ? 3 : 0) +
    (sellerRating >= 4 ? 2 : sellerRating > 0 ? 1 : 0);
}

function demandScore(product) {
  const position = number(product.source_rank, 100);
  const rankPoints = clamp(1 - (position - 1) / 50) * 5;
  const reviewDemand = clamp(Math.log10(number(product.review_count) + 1) / 5) * 3;
  const badge = /best|choice|popular|deal|trending/i.test(String(product.badge || "")) ? 2 : 0;
  return rankPoints + reviewDemand + badge;
}

function fulfillmentScore(product) {
  const shipping = String(product.shipping_summary || "").trim();
  const returns = String(product.return_summary || "").trim();
  const positiveReturns = returns && !/\b(not accepted|no returns|final sale)\b/i.test(returns);
  const fastOrFree = /\b(prime|free|same.day|next.day|fast)\b/i.test(shipping);
  const shippingPoints = shipping ? 4 : 2;
  const returnPoints = positiveReturns ? 3 : returns ? 0 : 1.5;
  return shippingPoints +
    returnPoints +
    (isAvailable(product) ? 2 : 0) +
    (fastOrFree ? 1 : 0);
}

function scoreProduct(product) {
  const breakdown = {
    model: SCORE_MODEL,
    price_quality: Math.round(priceScore(product) * 10) / 10,
    product_quality: Math.round(productQualityScore(product) * 10) / 10,
    review_confidence: Math.round(reviewConfidenceScore(product) * 10) / 10,
    seller_reliability: Math.round(sellerScore(product) * 10) / 10,
    demand_usefulness: Math.round(demandScore(product) * 10) / 10,
    shipping_returns: Math.round(fulfillmentScore(product) * 10) / 10
  };
  const total = Math.round((
    breakdown.price_quality +
    breakdown.product_quality +
    breakdown.review_confidence +
    breakdown.seller_reliability +
    breakdown.demand_usefulness +
    breakdown.shipping_returns
  ) * 10) / 10;
  return { total: clamp(total, 0, 100), breakdown };
}

function selectionReason(product, result) {
  const points = [];
  const current = number(product.current_price);
  const comparableMedian = number(product.comparable_median_price);
  if (number(product.comparable_offer_count) >= 2 && comparableMedian > current && current > 0) {
    points.push(`${Math.round((1 - current / comparableMedian) * 100)}% below the median of matching current offers`);
  } else if (number(product.original_price) > current && current > 0) {
    points.push(`${Math.round((1 - current / number(product.original_price)) * 100)}% below its retailer reference price`);
  }
  if (number(product.rating) > 0) points.push(`${number(product.rating).toFixed(1)}-star rating`);
  if (number(product.review_count) >= 25) points.push(`${Math.round(number(product.review_count)).toLocaleString("en-US")} reviews`);
  if (number(result.breakdown?.seller_reliability) >= 12) points.push("established seller evidence");
  else if (String(product.seller_name || "").trim()) points.push("an identified seller");
  if (String(product.shipping_summary || "").trim()) points.push("delivery terms");
  if (String(product.return_summary || "").trim()) points.push("return terms");
  const evidence = points.slice(0, 4);
  return evidence.length
    ? `Ranked using ${evidence.join(", ")}.`
    : "Ranked from the available current price, product, seller and fulfillment signals.";
}

function betterOffer(left, right) {
  if (!left) return right;
  if (number(right.score) !== number(left.score)) return number(right.score) > number(left.score) ? right : left;
  const leftPrice = number(left.current_price, Number.MAX_SAFE_INTEGER);
  const rightPrice = number(right.current_price, Number.MAX_SAFE_INTEGER);
  return rightPrice < leftPrice ? right : left;
}

function prepare(items, options) {
  const uniqueOffers = new Map();
  const eligible = addCurrentOfferComparisons((items || []).filter(item => isEligible(item, options)));
  for (const item of eligible) {
    const result = scoreProduct(item);
    if (!isDemo(item) && result.total < number(options.minimumScore, 60)) continue;
    const enriched = {
      ...item,
      score: result.total,
      score_breakdown: result.breakdown,
      selection_reason: selectionReason(item, result)
    };
    const exact = exactMatchKey(enriched);
    const key = exact ? `product:${exact}` : `title:${normalizedTitle(enriched.title)}`;
    uniqueOffers.set(key, betterOffer(uniqueOffers.get(key), enriched));
  }
  return [...uniqueOffers.values()].sort((left, right) => {
    if (number(right.score) !== number(left.score)) return number(right.score) - number(left.score);
    return number(left.current_price, Number.MAX_SAFE_INTEGER) - number(right.current_price, Number.MAX_SAFE_INTEGER);
  });
}

exports.scoreProduct = scoreProduct;
exports.isEligible = isEligible;
exports.SCORE_MODEL = SCORE_MODEL;
exports.rankProducts = (items, limit = 10, options = {}) => prepare(items, options).slice(0, limit);
