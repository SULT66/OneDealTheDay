const { isIP } = require("node:net");
const { isPublicProduct, uniqueProductsInOrder } = require("./publicCatalog");
const { offerStatus } = require("./offerStatus");
const { PRICE_CONFIDENT_HOURS } = require("./productPresentation");
const { market: marketDefinition, normalizeMarket } = require("./markets");
const {
  commerceQuality, headTerm, isEligible, isMainProductQuery, looksLikeAccessory,
  matchesMainProduct, normalizedTitle, queryBudget, searchTokens, landedCost,
} = require("./ranker");

// A promotion is a recommendation, so fulfillment and price need to be known.
// A themed card need not have a score or a saving; neither is invented here.
function safeHttps(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return url.protocol === "https:" && !url.username && !url.password &&
      (!url.port || url.port === "443") && !isIP(host) && host.includes(".") &&
      !/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host);
  } catch { return false; }
}

function linkHasFailure(product) {
  const health = product.link_health && typeof product.link_health === "object" ? product.link_health : {};
  const status = product.link_last_status ?? health.last_status ?? product.last_status;
  const failures = product.link_consecutive_failures ?? health.consecutive_failures ?? product.consecutive_failures;
  const error = product.link_last_error ?? health.last_error ?? product.last_error;
  return Number(failures || 0) > 0 || Boolean(String(error || "").trim()) ||
    (status != null && !(Number(status) >= 200 && Number(status) < 400));
}

function isPromotionEligible(product, { market = "us", now = Date.now() } = {}) {
  const code = normalizeMarket(market);
  if (!code || !product || !isPublicProduct(product)) return false;
  if (String(product.market || "").toLowerCase() !== code ||
      String(product.currency || "").toUpperCase() !== marketDefinition(code).currency) return false;
  if (!safeHttps(product.affiliate_url) || !safeHttps(product.image_url) || linkHasFailure(product)) return false;
  const checkedAt = Date.parse(product.checked_at || "");
  if (!Number.isFinite(checkedAt) || checkedAt > now || !Number.isFinite(now) ||
      now >= checkedAt + PRICE_CONFIDENT_HOURS * 3600000) return false;
  const status = offerStatus({ ...product, availability: String(product.availability || "").replace(/_/g, " ") }, { now });
  if (!status.publishable || !status.price.is_current || status.availability !== "in_stock") return false;
  if (!status.returns.allowed || status.delivery.cost == null ||
      status.delivery.cost > Number(product.current_price) * 0.5) return false;
  if (Number(product.rating) > 0 && Number(product.rating) < 4.3) return false;
  if (status.score_missing_reasons.some(item => item.reason === "seller_record_below_bar")) return false;
  return isEligible(product, { currency: marketDefinition(code).currency, maximumShippingRatio: 0.5 }) &&
    commerceQuality(product) >= 0.45;
}

const stamp = value => typeof value === "number" ? value : Date.parse(value || "");
const array = value => Array.isArray(value) ? value : [];
function activeSignal(signal, market, now) {
  return signal && ["seasonal", "trend"].includes(signal.kind) && signal.market === market &&
    stamp(signal.startsAt) <= now && now < stamp(signal.endsAt);
}

function matchesQuery(product, query) {
  const terms = searchTokens(query).filter(term => !/^\d+(?:\.\d+)?$/.test(term));
  if (!terms.length) return false;
  // Every query word must describe the actual product. A category such as
  // Home is not evidence that a mattress belongs to a Halloween shelf.
  const headline = normalizedTitle(`${product.title || ""} ${product.brand || ""}`);
  const words = headline.split(" ");
  const stems = word => [...new Set([word, word.replace(/ies$/, "y"), word.replace(/es$/, ""), word.replace(/s$/, "")])];
  if (!terms.every(term => words.some(word => stems(word).some(stem => stems(term).includes(stem))))) return false;
  if (isMainProductQuery(query) && !matchesMainProduct(product, query)) return false;
  // Generic queries still must name the product in its headline.
  if (looksLikeAccessory(product, query) && headTerm(query)) return false;
  const budget = queryBudget(query);
  const cost = landedCost(product);
  return (budget.max == null || cost <= budget.max) && (budget.min == null || cost >= budget.min);
}

function balanced(products, limit) {
  const selected = [];
  const retailers = new Map();
  const categories = new Map();
  const remaining = [...products];
  while (remaining.length && selected.length < limit) {
    // Diversity is a tie-break between qualified matches, never a relaxation
    // of relevance or safety. A one-retailer catalogue may still fill a shelf.
    let best = 0;
    const usage = product => (retailers.get(product.retailer_name || product.source) || 0) * 2 +
      (categories.get(product.normalized_category || product.category) || 0);
    for (let index = 1; index < remaining.length; index += 1) {
      if (usage(remaining[index]) < usage(remaining[best])) best = index;
    }
    const [product] = remaining.splice(best, 1);
    selected.push(product);
    const retailer = product.retailer_name || product.source;
    const category = product.normalized_category || product.category;
    retailers.set(retailer, (retailers.get(retailer) || 0) + 1);
    categories.set(category, (categories.get(category) || 0) + 1);
  }
  return selected;
}

function selectMerchandise(rows, signals, { market = "us", now = Date.now(), limitPerSignal = 6 } = {}) {
  const code = normalizeMarket(market);
  if (!code || !Number.isFinite(now)) return [];
  const limit = Math.max(0, Math.min(24, Math.floor(Number(limitPerSignal) || 0)));
  const eligible = array(rows).filter(product => isPromotionEligible(product, { market: code, now }));
  return array(signals).filter(signal => activeSignal(signal, code, now)).map(signal => {
    const matching = eligible.filter(product => array(signal.queries).some(query => matchesQuery(product, query)));
    const ordered = matching.sort((left, right) => commerceQuality(right) - commerceQuality(left) ||
      Date.parse(right.checked_at) - Date.parse(left.checked_at) || Number(left.id) - Number(right.id));
    const unique = uniqueProductsInOrder(ordered);
    return { signal, products: balanced(unique, limit), rejected: array(rows).length - unique.length };
  });
}

function promotionExpiresAt(product) {
  const at = Date.parse(product?.checked_at || "");
  return Number.isFinite(at) ? new Date(at + PRICE_CONFIDENT_HOURS * 3600000).toISOString() : null;
}

module.exports = { isPromotionEligible, promotionExpiresAt, selectMerchandise };
