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
  const historyCount = number(product.price_history_observation_count);
  const historyDays = number(product.price_history_distinct_days);
  const hasTrackedHistory = historyCount >= 2 && historyDays >= 2;
  const trackedReference = Math.max(
    hasTrackedHistory ? number(product.average_30_day_price) : 0,
    hasTrackedHistory ? number(product.average_90_day_price) : 0,
    number(product.typical_price),
    0
  );
  const listReference = number(product.original_price);
  const reference = trackedReference > 0 ? trackedReference : listReference;
  const discount = reference > current && current > 0 ? (reference - current) / reference : 0;
  const trackedLow = hasTrackedHistory
    ? Math.max(number(product.lowest_30_day_price), number(product.lowest_90_day_price))
    : 0;
  const nearTrackedLow = trackedLow > 0 && current <= trackedLow * 1.03;
  const discountPoints = clamp(discount / 0.4) * (trackedReference > 0 ? 20 : 10);
  const referencePoints = trackedReference > current ? 6 : listReference > current ? 2 : current > 0 ? 1 : 0;
  const rawScore = discountPoints + referencePoints + (nearTrackedLow ? 4 : 0);
  const historyConfidence = hasTrackedHistory ? 0.5 + clamp(historyDays / 30) * 0.5 : 1;
  return rawScore * historyConfidence;
}

function productQualityScore(product) {
  const rating = number(product.rating);
  const ratingPoints = clamp((rating - 3.8) / 1.2) * 17;
  const badgePoints = /choice|best seller|editor/i.test(String(product.badge || "")) ? 3 : 0;
  return ratingPoints + badgePoints;
}

function reviewConfidenceScore(product) {
  const reviews = number(product.review_count);
  const volume = clamp(Math.log10(reviews + 1) / 5) * 12;
  const confidence = number(product.rating) >= 4.2 && reviews >= 100 ? 3 : 0;
  return volume + confidence;
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
  return (shipping ? 4 : 0) +
    (positiveReturns ? 3 : 0) +
    (isAvailable(product) ? 2 : 0) +
    (fastOrFree ? 1 : 0);
}

function scoreProduct(product) {
  const breakdown = {
    price_quality: Math.round(priceScore(product) * 10) / 10,
    product_quality: Math.round(productQualityScore(product) * 10) / 10,
    review_confidence: Math.round(reviewConfidenceScore(product) * 10) / 10,
    seller_reliability: Math.round(sellerScore(product) * 10) / 10,
    demand_usefulness: Math.round(demandScore(product) * 10) / 10,
    shipping_returns: Math.round(fulfillmentScore(product) * 10) / 10
  };
  const evidencePenalty =
    (!String(product.seller_name || product.retailer_name || "").trim() ? 3 : 0) +
    (!String(product.shipping_summary || "").trim() ? 2 : 0) +
    (!String(product.return_summary || "").trim() ? 2 : 0);
  const total = Math.round((Object.values(breakdown).reduce((sum, value) => sum + value, 0) - evidencePenalty) * 10) / 10;
  return { total: clamp(total, 0, 100), breakdown };
}

function selectionReason(product, result) {
  const points = [];
  const current = number(product.current_price);
  const trackedReference = Math.max(
    number(product.average_30_day_price),
    number(product.average_90_day_price),
    number(product.typical_price)
  );
  const reference = trackedReference > 0 ? trackedReference : number(product.original_price);
  if (reference > current && current > 0) {
    points.push(`${Math.round((1 - current / reference) * 100)}% below its ${trackedReference > 0 ? "tracked typical" : "reference"} price`);
  } else if (Math.max(number(product.lowest_30_day_price), number(product.lowest_90_day_price)) > 0 &&
    current <= Math.max(number(product.lowest_30_day_price), number(product.lowest_90_day_price)) * 1.03) {
    points.push("within 3% of its tracked 90-day low");
  }
  if (number(product.rating) > 0) points.push(`${number(product.rating).toFixed(1)}-star rating`);
  if (number(product.review_count) >= 25) points.push(`${Math.round(number(product.review_count)).toLocaleString("en-US")} reviews`);
  if (number(result.breakdown?.seller_reliability) >= 12) points.push("established seller evidence");
  else if (String(product.seller_name || "").trim()) points.push("an identified seller");
  if (String(product.shipping_summary || "").trim()) points.push("delivery terms");
  if (String(product.return_summary || "").trim()) points.push("return terms");
  const evidence = points.slice(0, 4);
  return evidence.length
    ? `Ranked using ${evidence.join(", ")}; missing evidence received no points.`
    : "Ranked from the available price, product, seller and fulfillment evidence; missing evidence received no points.";
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
  for (const item of items || []) {
    if (!isEligible(item, options)) continue;
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
exports.rankProducts = (items, limit = 10, options = {}) => prepare(items, options).slice(0, limit);
