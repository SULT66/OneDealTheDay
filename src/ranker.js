function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

const { brandPart, normalizeProductIdentity, variantPart } = require("./productIdentity");

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

const TITLE_NOISE = new Set([
  "authentic", "brand", "fast", "free", "genuine", "instock", "new", "newest",
  "nib", "official", "original", "renewed", "refurbished", "sealed", "seller",
  "shipping", "unused"
]);

function titleFingerprint(title) {
  const tokens = normalizedTitle(title)
    .split(" ")
    .filter(token => token.length > 1 && !TITLE_NOISE.has(token));
  if (tokens.length < 4) return "";
  return [...new Set(tokens)].sort().join("-");
}

function exactMatchKey(product) {
  return normalizeProductIdentity(product).product_key || "";
}

function deduplicationKeys(product) {
  const normalized = normalizeProductIdentity(product);
  const keys = [];
  const exact = normalized.product_key || "";
  const sourceGroup = String(normalized.source_group_key || "").trim();
  const source = String(normalized.source_catalog_id || normalized.source || normalized.provider || "source").toLowerCase();
  const market = String(normalized.market || "global").toLowerCase();
  const offerId = String(normalized.provider_external_id || normalized.external_id || "").trim();
  if (exact) keys.push(`product:${exact}`);
  if (sourceGroup) keys.push(`source-group:${sourceGroup}`);
  if (offerId) keys.push(`offer:${source}:${market}:${offerId}`);
  return [...new Set(keys)];
}

function deduplicationCandidateKeys(product) {
  const brand = brandPart(product);
  const fingerprint = titleFingerprint(product?.canonical_title || product?.title);
  if (!brand || fingerprint.length < 16) return [];
  const category = normalizedTitle(product?.normalized_category || product?.category);
  const variant = variantPart(product);
  return [`title-candidate:${brand}:${category || "uncategorized"}:${fingerprint}${variant ? `:${variant}` : ""}`];
}

const SCORE_MODEL = "current-offer-v7";
const RANKING_MODEL = "ranking-v1";

const SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "at", "best", "buy", "for", "from", "good", "in", "me", "of", "on", "or", "the", "to", "with",
  "under", "below", "less", "than", "max", "maximum", "over", "above", "more", "minimum",
  "find", "show", "looking", "want", "need", "please"
]);

function roundScore(value) {
  return Math.round(number(value) * 1000) / 1000;
}

function searchTokens(value) {
  return normalizedTitle(value)
    .split(" ")
    .filter(token => token.length > 1 && !/^\d+(?:\.\d+)?$/.test(token) && !SEARCH_STOP_WORDS.has(token));
}

function queryBudget(query, intent = {}) {
  const explicitMax = number(intent.maxPrice ?? intent.max_price ?? intent.budget, NaN);
  const explicitMin = number(intent.minPrice ?? intent.min_price, NaN);
  const text = String(query || "");
  const maximum = text.match(/(?:under|below|less than|max(?:imum)?|up to)\s*(?:USD|CAD|GBP|EUR|[$£€])?\s*([0-9][0-9,.]*)/i);
  const minimum = text.match(/(?:over|above|more than|min(?:imum)?|at least)\s*(?:USD|CAD|GBP|EUR|[$£€])?\s*([0-9][0-9,.]*)/i);
  return {
    max:Number.isFinite(explicitMax) ? explicitMax : maximum ? localizedAmount(maximum[1]) : null,
    min:Number.isFinite(explicitMin) ? explicitMin : minimum ? localizedAmount(minimum[1]) : null
  };
}

function textMatchScore(product, query, intent = {}) {
  const requestedCategory = normalizedTitle(intent.category || "");
  const requestedBrand = normalizedTitle(intent.brand || "");
  const terms = [...new Set([
    ...searchTokens(query),
    ...searchTokens(intent.product || intent.productType || intent.product_type || ""),
    ...searchTokens(requestedCategory),
    ...searchTokens(requestedBrand),
    ...searchTokens(Array.isArray(intent.attributes) ? intent.attributes.join(" ") : intent.attributes || ""),
    ...searchTokens(intent.useCase || intent.use_case || "")
  ])];
  const fields = {
    title:normalizedTitle(product.title),
    brand:normalizedTitle(product.brand),
    category:normalizedTitle(product.normalized_category || product.category),
    description:normalizedTitle(product.description)
  };
  let relevance = terms.length
    ? terms.reduce((sum, term) => {
      if (fields.title.includes(term)) return sum + 1;
      if (fields.brand.includes(term)) return sum + 0.95;
      if (fields.category.includes(term)) return sum + 0.9;
      if (fields.description.includes(term)) return sum + 0.55;
      return sum;
    }, 0) / terms.length
    : 1;
  const phrase = normalizedTitle(query);
  if (phrase && fields.title.includes(phrase)) relevance = Math.min(1, relevance + 0.12);
  if (requestedCategory && fields.category && !fields.category.includes(requestedCategory) && !requestedCategory.includes(fields.category)) relevance *= 0.35;
  if (requestedBrand && fields.brand && fields.brand !== requestedBrand) relevance *= 0.25;
  const budget = queryBudget(query, intent);
  const price = landedCost(product);
  if (budget.max != null && price > budget.max) relevance *= 0.2;
  if (budget.min != null && price < budget.min) relevance *= 0.4;
  return clamp(relevance);
}

function localizedAmount(value) {
  let candidate = String(value || "").replace(/\s/g, "");
  if (!candidate) return null;
  const lastComma = candidate.lastIndexOf(",");
  const lastDot = candidate.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    candidate = candidate.replace(decimal === "," ? /\./g : /,/g, "").replace(decimal, ".");
  } else if (lastComma >= 0) {
    candidate = /,\d{1,2}$/.test(candidate) ? candidate.replace(",", ".") : candidate.replace(/,/g, "");
  } else if ((candidate.match(/\./g) || []).length > 1) {
    candidate = candidate.replace(/\./g, "");
  }
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function paidShippingCost(product) {
  if (product?.shipping_cost != null && product.shipping_cost !== "") {
    const explicit = number(product.shipping_cost, NaN);
    if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  }
  const summary = String(product?.shipping_summary || "").trim();
  if (!summary) return null;
  if (/\bfree\s+(?:shipping|delivery)\b|\blivraison gratuite\b|\bkostenlose lieferung\b/i.test(summary)) return 0;
  const amountPattern = "([0-9][0-9\\s.,]*)";
  const patterns = [
    new RegExp(`\\b(?:USD|CAD|GBP|EUR)\\s*${amountPattern}`, "i"),
    new RegExp(`(?:US|CA|C)?\\s*[$£€]\\s*${amountPattern}`, "i"),
    new RegExp(`\\b(?:shipping|delivery|livraison|lieferung)\\s*:?\\s*${amountPattern}`, "i")
  ];
  for (const pattern of patterns) {
    const match = summary.match(pattern);
    const parsed = match ? localizedAmount(match[1]) : null;
    if (parsed != null) return parsed;
  }
  return null;
}

function landedCost(product) {
  const price = number(product?.current_price);
  if (price <= 0) return 0;
  const shipping = paidShippingCost(product);
  return price + (shipping == null ? 0 : shipping);
}

function shippingRatio(product) {
  const price = number(product?.current_price);
  const shipping = paidShippingCost(product);
  return price > 0 && shipping != null ? shipping / price : null;
}

function hasUnsafeTitle(product) {
  const title = String(product?.title || "").trim();
  return title.length < 8 || /^(?:test|n\/?a)$/i.test(title) || /\b(?:not for sale|not sold separately|non[ -]?delivery)\b/i.test(title);
}

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
    const price = landedCost(product);
    if (!key || !currency || price <= 0) continue;
    const groupKey = `${currency}:${key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(price);
  }

  return items.map(product => {
    const key = exactMatchKey(product);
    const currency = String(product.currency || "").toUpperCase();
    const prices = groups.get(`${currency}:${key}`) || [];
    const shippingCost = paidShippingCost(product);
    const totalCost = landedCost(product);
    return prices.length >= 2
      ? {...product, shipping_cost:shippingCost, landed_cost:totalCost, comparable_offer_count:prices.length, comparable_median_price:median(prices), comparable_median_landed_cost:median(prices)}
      : {...product, shipping_cost:shippingCost, landed_cost:totalCost};
  });
}

function isDemo(product) {
  return String(product.source || "").toLowerCase() === "demo";
}

function isAvailable(product) {
  return !/\b(out of stock|unavailable|sold out|expired|discontinued)\b/i.test(String(product.availability || ""));
}

function returnsNotAccepted(product) {
  return /\b(?:returns? not accepted|no returns?|final sale|retours? non acceptés?|aucun retour|keine rückgabe|rückgabe ausgeschlossen)\b/i.test(String(product.return_summary || ""));
}

function isEligible(product, options = {}) {
  if (!product?.title || !product?.image_url) return false;
  if (isDemo(product)) return true;
  if (hasUnsafeTitle(product)) return false;
  if (!/^https?:\/\//i.test(String(product.affiliate_url || ""))) return false;
  if (!isAvailable(product)) return false;
  if (number(product.current_price) <= 0) return false;
  const noReturns = returnsNotAccepted(product);
  const deliveryBurden = shippingRatio(product);
  const shipping = paidShippingCost(product);
  const price = number(product.current_price);
  const maximumShippingRatio = number(options.maximumShippingRatio, 0.5);
  if (shipping != null && (shipping > price || deliveryBurden > maximumShippingRatio || (noReturns && deliveryBurden >= 0.35))) return false;
  if (number(options.minimumRating, 0) > 0 && number(product.rating) < number(options.minimumRating)) return false;
  if (number(options.minimumReviews, 0) > 0 && number(product.review_count) < number(options.minimumReviews)) return false;
  if (options.currency && String(product.currency || "").toUpperCase() !== String(options.currency).toUpperCase()) return false;
  const totalPrice = landedCost(product);
  if (options.maximumPrice != null && number(options.maximumPrice) > 0 && totalPrice > number(options.maximumPrice)) return false;
  if (options.minimumPrice != null && number(options.minimumPrice) > 0 && totalPrice < number(options.minimumPrice)) return false;
  const intent = options.intent && typeof options.intent === "object" ? options.intent : {};
  const requestedCategory = normalizedTitle(intent.category || "");
  const productCategory = normalizedTitle(product.normalized_category || product.category || "");
  if (requestedCategory && !productCategory.includes(requestedCategory) && !requestedCategory.includes(productCategory)) return false;
  const requestedBrand = normalizedTitle(intent.brand || "");
  if (requestedBrand && normalizedTitle(product.brand || "") !== requestedBrand) return false;
  return true;
}

function isDailyPickEligible(product, options = {}) {
  if (!isEligible(product, {...options, maximumShippingRatio:number(options.maximumShippingRatio, 0.25)})) return false;
  if (returnsNotAccepted(product)) return false;
  const shipping = paidShippingCost(product);
  if (shipping == null) return false;
  const rating = number(product.rating);
  if (rating > 0 && rating < number(options.minimumDailyRating, 4.3)) return false;
  const source = retailer(product);
  if (source === "ebay" && (number(product.seller_rating) < 4.8 || number(product.seller_feedback_count) < 100)) return false;
  const result = scoreProduct(product);
  const quality = product.commerce_quality != null
    ? number(product.commerce_quality) / 100
    : commerceQuality(product, result.breakdown);
  const confidence = number(product.evidence_confidence ?? result.evidenceConfidence);
  const publicScorePasses = options.minimumDailyScore == null ||
    number(product.score ?? result.total) >= number(options.minimumDailyScore);
  return publicScorePasses &&
    quality >= number(options.minimumDailyCommerceQuality, 0.45) &&
    confidence >= number(options.minimumDailyEvidenceConfidence, 55);
}

function priceScore(product) {
  const current = landedCost(product);
  if (current <= 0) return 0;
  const comparableCount = number(product.comparable_offer_count);
  const comparableMedian = number(product.comparable_median_price);
  const listReference = number(product.original_price);
  const itemPrice = number(product.current_price);
  const referenceGap = listReference > itemPrice ? (listReference - itemPrice) / listReference : 0;
  // A seller's struck-through reference price is supporting evidence, not
  // tracked price history. It can help, but never earn more than half of the
  // price component by itself.
  const referenceScore = referenceGap > 0 ? clamp(4 + referenceGap * 30, 4, 15) : 0;
  if (comparableCount < 2 || comparableMedian <= 0) return referenceScore;

  // A median of matching landed costs is the primary price signal. At the
  // market median an offer earns 15/30; a lower all-in cost earns more.
  const marketAdvantage = (comparableMedian - current) / comparableMedian;
  const marketScore = clamp(15 + marketAdvantage * 50, 0, 30);
  return Math.max(referenceScore, marketScore);
}

function productQualityScore(product) {
  const rating = number(product.rating);
  const brand = String(product.brand || "").trim();
  const brandMultiplier = brand && !/^(?:unbranded|generic|unknown)$/i.test(brand) ? 1 : 0.9;
  if (rating <= 0) return 0;
  return clamp((rating - 3.8) / 1.2) * 20 * brandMultiplier;
}

function reviewConfidenceScore(product) {
  const reviews = number(product.review_count);
  if (reviews <= 0) return 0;
  return clamp(Math.log10(reviews + 1) / 4) * 15;
}

function sellerScore(product) {
  const knownRetailer = ["amazon", "walmart", "ebay", "target", "best buy", "bestbuy"].includes(retailer(product)) ||
    /^(?:amazon|walmart|ebay|target|best\s*buy)$/i.test(String(product.retailer_name || "").trim());
  const seller = String(product.seller_name || "").trim();
  const sellerRating = number(product.seller_rating);
  const feedback = number(product.seller_feedback_count);
  return Math.min(15, (knownRetailer ? 5 : 0) +
    (seller ? 3 : 0) +
    (isAvailable(product) ? 2 : 0) +
    (sellerRating >= 4.8 ? 3 : sellerRating >= 4 ? 2 : sellerRating > 0 ? 1 : 0) +
    (feedback >= 100 ? 2 : feedback > 0 ? 1 : 0));
}

function demandScore(product) {
  const position = number(product.source_rank, 100);
  const rankPoints = clamp(1 - (position - 1) / 50) * 4;
  const reviewDemand = clamp(Math.log10(number(product.review_count) + 1) / 5) * 4;
  const badge = /best|choice|popular|deal|trending/i.test(String(product.badge || "")) ? 2 : 0;
  return rankPoints + reviewDemand + badge;
}

function fulfillmentScore(product) {
  const shipping = String(product.shipping_summary || "").trim();
  const returns = String(product.return_summary || "").trim();
  const positiveReturns = returns && !/\b(not accepted|no returns|final sale)\b/i.test(returns);
  const fastOrFree = /\b(prime|free|same.day|next.day|fast)\b/i.test(shipping);
  const deliveryBurden = shippingRatio(product);
  const shippingPoints = !shipping ? 0
    : fastOrFree ? 4
      : deliveryBurden == null ? 1
        : deliveryBurden >= 0.5 ? 0
        : deliveryBurden >= 0.25 ? 1
          : 3;
  const returnPoints = positiveReturns ? 3 : 0;
  return Math.min(10, shippingPoints +
    returnPoints +
    (isAvailable(product) ? 2 : 0) +
    (fastOrFree ? 1 : 0));
}

function neutralSellerQuality(product) {
  const rating = number(product.seller_rating);
  const feedback = number(product.seller_feedback_count);
  if (rating <= 0 && feedback <= 0) return null;
  const normalizedRating = rating > 5
    ? clamp((rating - 80) / 20)
    : rating > 0 ? clamp((rating - 3.5) / 1.5) : 0.5;
  const feedbackStrength = feedback > 0 ? clamp(Math.log10(feedback + 1) / 4) : 0.5;
  return clamp(normalizedRating * 0.8 + feedbackStrength * 0.2);
}

function commerceQuality(product, breakdown = null) {
  const components = breakdown || scoreProduct(product).breakdown;
  const available = [];
  const add = (known, value, maximum, weight) => {
    if (known) available.push({quality:clamp(number(value) / maximum), weight});
  };
  const hasPriceContext = number(product.comparable_offer_count) >= 2 ||
    number(product.original_price) > number(product.current_price) ||
    number(product.average_30_day_price) > 0 ||
    number(product.average_90_day_price) > 0;
  const hasRating = number(product.rating) > 0;
  const hasReviews = number(product.review_count) > 0;
  const sellerQuality = neutralSellerQuality(product);
  const hasFulfillment = Boolean(String(product.shipping_summary || "").trim() || String(product.return_summary || "").trim());
  const current = landedCost(product);
  const trackedAverage = number(product.average_30_day_price) || number(product.average_90_day_price);
  const trackedPriceQuality = current > 0 && trackedAverage > 0
    ? clamp((15 + ((trackedAverage - current) / trackedAverage) * 50) / 30)
    : 0;
  const priceQuality = Math.max(clamp(number(components.price_quality) / 30), trackedPriceQuality);
  add(hasPriceContext, priceQuality, 1, 30);
  add(hasRating, components.product_quality, 20, 25);
  add(hasReviews, components.review_confidence, 15, 10);
  add(sellerQuality != null, sellerQuality, 1, 15);
  add(hasFulfillment, components.shipping_returns, 10, 20);
  if (!available.length) return 0.5;
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  return clamp(available.reduce((sum, item) => sum + item.quality * item.weight, 0) / weight);
}

function evidenceConfidence(product) {
  const priceEvidence = number(product.comparable_offer_count) >= 2 ||
    number(product.original_price) > number(product.current_price) ||
    number(product.average_30_day_price) > 0 ||
    number(product.average_90_day_price) > 0;
  const identity = exactMatchKey(product);
  const sellerEvidence = number(product.seller_rating) > 0 ||
    number(product.seller_feedback_count) > 0 ||
    Boolean(String(product.seller_name || "").trim());
  const shippingKnown = paidShippingCost(product) != null || /\b(?:ships|shipping|delivery|livraison|lieferung)\b/i.test(String(product.shipping_summary || ""));
  const returnsKnown = Boolean(String(product.return_summary || "").trim());
  return Math.round((
    (priceEvidence ? 25 : 0) +
    (identity ? 10 : 0) +
    (number(product.rating) > 0 ? 15 : 0) +
    (number(product.review_count) > 0 ? 10 : 0) +
    (sellerEvidence ? 15 : 0) +
    (shippingKnown ? 10 : 0) +
    (returnsKnown ? 10 : 0) +
    (isAvailable(product) ? 5 : 0)
  ));
}

function rankingLayers(product, options = {}, scoreResult = null) {
  const result = scoreResult || scoreProduct(product);
  const intent = options.intent && typeof options.intent === "object" ? options.intent : {};
  const query = String(options.query || intent.query || "").trim();
  const mode = query || Object.keys(intent).length ? "search" : "browse";
  const relevance = textMatchScore(product, query, intent);
  const quality = commerceQuality(product, result.breakdown);
  const confidence = clamp(number(result.evidenceConfidence) / 100);
  const weights = mode === "search"
    ? {relevance:0.60, commerce_quality:0.25, data_confidence:0.15}
    : {relevance:0.25, commerce_quality:0.50, data_confidence:0.25};
  const finalRank = relevance * weights.relevance + quality * weights.commerce_quality + confidence * weights.data_confidence;
  return {
    model:RANKING_MODEL,
    mode,
    relevance:roundScore(relevance * 100),
    commerce_quality:roundScore(quality * 100),
    data_confidence:roundScore(confidence * 100),
    final_rank:roundScore(finalRank * 100),
    weights
  };
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
  return { total: clamp(total, 0, 100), evidenceConfidence:evidenceConfidence(product), breakdown };
}

function selectionReason(product, result) {
  const points = [];
  const current = number(product.current_price);
  const totalCost = landedCost(product);
  const comparableMedian = number(product.comparable_median_price);
  if (number(product.comparable_offer_count) >= 2 && comparableMedian > totalCost && totalCost > 0) {
    points.push(`${Math.round((1 - totalCost / comparableMedian) * 100)}% below the median landed cost of matching current offers`);
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
  if (number(right.ranking_score) !== number(left.ranking_score)) return number(right.ranking_score) > number(left.ranking_score) ? right : left;
  if (number(right.commerce_quality) !== number(left.commerce_quality)) return number(right.commerce_quality) > number(left.commerce_quality) ? right : left;
  if (number(right.evidence_confidence) !== number(left.evidence_confidence)) return number(right.evidence_confidence) > number(left.evidence_confidence) ? right : left;
  const leftPrice = number(left.landed_cost, Number.MAX_SAFE_INTEGER);
  const rightPrice = number(right.landed_cost, Number.MAX_SAFE_INTEGER);
  return rightPrice < leftPrice ? right : left;
}

function scoreOffers(items, options = {}) {
  const budget = queryBudget(options.query, options.intent || {});
  const eligibilityOptions = {
    ...options,
    maximumPrice:options.maximumPrice ?? options.maxPrice ?? options.max_price ?? budget.max,
    minimumPrice:options.minimumPrice ?? options.minPrice ?? options.min_price ?? budget.min
  };
  const normalized = (items || []).map(normalizeProductIdentity);
  const eligible = addCurrentOfferComparisons(normalized.filter(item => isEligible(item, eligibilityOptions)));
  return eligible.map(item => {
    const result = scoreProduct(item);
    const ranking = rankingLayers(item, options, result);
    return {
      ...item,
      score: result.total,
      evidence_confidence: result.evidenceConfidence,
      relevance_score: ranking.relevance,
      commerce_quality: ranking.commerce_quality,
      ranking_score: ranking.final_rank,
      score_breakdown: {...result.breakdown, ranking},
      selection_reason: selectionReason(item, result)
    };
  }).filter(item => isDemo(item) || (
    item.score >= number(options.minimumScore, 0) &&
    item.commerce_quality >= number(options.minimumCommerceQuality, 0) &&
    item.evidence_confidence >= number(options.minimumEvidenceConfidence, 0)
  ))
    .sort((left, right) => {
      if (number(right.ranking_score) !== number(left.ranking_score)) return number(right.ranking_score) - number(left.ranking_score);
      if (number(right.relevance_score) !== number(left.relevance_score)) return number(right.relevance_score) - number(left.relevance_score);
      if (number(right.commerce_quality) !== number(left.commerce_quality)) return number(right.commerce_quality) - number(left.commerce_quality);
      if (number(right.evidence_confidence) !== number(left.evidence_confidence)) return number(right.evidence_confidence) - number(left.evidence_confidence);
      return number(left.landed_cost, Number.MAX_SAFE_INTEGER) - number(right.landed_cost, Number.MAX_SAFE_INTEGER);
    });
}

function selectUniqueProducts(scoredOffers) {
  const groups = [];
  for (const enriched of scoredOffers || []) {
    const keys = new Set(deduplicationKeys(enriched));
    const matching = [];
    groups.forEach((group, index) => {
      if ([...keys].some(key => group.keys.has(key))) matching.push(index);
    });
    if (!matching.length) {
      groups.push({ keys, offer: enriched });
      continue;
    }
    const target = groups[matching[0]];
    target.offer = betterOffer(target.offer, enriched);
    keys.forEach(key => target.keys.add(key));
    for (let offset = matching.length - 1; offset >= 1; offset -= 1) {
      const duplicate = groups[matching[offset]];
      target.offer = betterOffer(target.offer, duplicate.offer);
      duplicate.keys.forEach(key => target.keys.add(key));
      groups.splice(matching[offset], 1);
    }
  }
  return groups.map(group => group.offer).sort((left, right) => {
    if (number(right.ranking_score) !== number(left.ranking_score)) return number(right.ranking_score) - number(left.ranking_score);
    if (number(right.relevance_score) !== number(left.relevance_score)) return number(right.relevance_score) - number(left.relevance_score);
    if (number(right.commerce_quality) !== number(left.commerce_quality)) return number(right.commerce_quality) - number(left.commerce_quality);
    if (number(right.evidence_confidence) !== number(left.evidence_confidence)) return number(right.evidence_confidence) - number(left.evidence_confidence);
    return number(left.landed_cost, Number.MAX_SAFE_INTEGER) - number(right.landed_cost, Number.MAX_SAFE_INTEGER);
  });
}

exports.scoreProduct = scoreProduct;
exports.isEligible = isEligible;
exports.isDailyPickEligible = isDailyPickEligible;
exports.evidenceConfidence = evidenceConfidence;
exports.commerceQuality = commerceQuality;
exports.rankingLayers = rankingLayers;
exports.deduplicationCandidateKeys = deduplicationCandidateKeys;
exports.deduplicationKeys = deduplicationKeys;
exports.exactMatchKey = exactMatchKey;
exports.landedCost = landedCost;
exports.paidShippingCost = paidShippingCost;
exports.SCORE_MODEL = SCORE_MODEL;
exports.RANKING_MODEL = RANKING_MODEL;
exports.scoreOffers = scoreOffers;
exports.selectUniqueProducts = selectUniqueProducts;
exports.rankProducts = (items, limit = 10, options = {}) => selectUniqueProducts(scoreOffers(items, options)).slice(0, limit);
