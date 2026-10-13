const { isIP } = require("node:net");
const { isPublicProduct, uniqueProductsInOrder } = require("./publicCatalog");
const { offerStatus } = require("./offerStatus");
const { PRICE_CONFIDENT_HOURS } = require("./productPresentation");
const { market: marketDefinition, normalizeMarket } = require("./markets");
const { unknownRetailerTerms } = require('./verifiedRetailerTerms');
const {
  commerceQuality, headTerm, isEligible, isMainProductQuery, looksLikeAccessory,
  matchesMainProduct, normalizedTitle, queryBudget, searchTokens, landedCost, returnsNotAccepted,
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

function* promotionRejections(product, { market = "us", now = Date.now() } = {}) {
  const code = normalizeMarket(market);
  if (!code || !product || !Number.isFinite(now)) { yield 'invalid_market_or_product'; return; }
  if (!isPublicProduct(product)) yield 'not_public';
  if (String(product.market || "").toLowerCase() !== code ||
      String(product.currency || "").toUpperCase() !== marketDefinition(code).currency) yield 'wrong_market_or_currency';
  if (!safeHttps(product.affiliate_url) || !safeHttps(product.image_url)) yield 'unsafe_link_or_image';
  if (linkHasFailure(product)) yield 'link_check_failed';
  const checkedAt = Date.parse(product.checked_at || "");
  if (!Number.isFinite(checkedAt)) yield 'price_check_missing';
  else if (checkedAt > now) yield 'price_check_in_future';
  else if (now >= checkedAt + PRICE_CONFIDENT_HOURS * 3600000) yield 'price_stale';
  const status = offerStatus({ ...product, availability: String(product.availability || "").replace(/_/g, " ") }, { now });
  if (!status.publishable) yield 'offer_incomplete';
  if (status.availability !== 'in_stock') yield 'stock_not_confirmed';
  if (status.returns.allowed == null || unknownRetailerTerms(product.return_summary)) yield 'returns_unknown';
  else if (!status.returns.allowed || returnsNotAccepted(product)) yield 'returns_refused';
  if (status.delivery.cost == null) yield 'shipping_unknown';
  else if (status.delivery.cost > Number(product.current_price) * 0.5) yield 'shipping_expensive';
  if (Number(product.rating) > 0 && Number(product.rating) < 4.3) yield 'rating_below_bar';
  if (status.score_missing_reasons.some(item => item.reason === 'seller_record_below_bar')) yield 'seller_below_bar';
  if (!isEligible(product, { currency: marketDefinition(code).currency, maximumShippingRatio: 0.5 })) yield 'basic_eligibility_failed';
  if (commerceQuality(product) < 0.45) yield 'quality_below_bar';
}
function promotionRejectionReasons(product, options = {}) {
  return [...promotionRejections(product, options)];
}
function isPromotionEligible(product, options = {}) {
  return promotionRejections(product, options).next().done;
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
  // "Desk chair" and "under desk drawer" name another product, not a desk.
  if (headTerm(query) === 'desk' && /\b(?:chair|drawer|mat|organizer|organiser|lamp|riser)\b/.test(headline) &&
      !/\bdesk\s+(?:with|includes|including)\b/.test(headline)) return false;
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

function merchandisingDiagnostics(rows, signals, { market = 'us', now = Date.now() } = {}) {
  const assessed = array(rows).filter(row => row.market === market && row.status === 'published')
    .map(row => ({ row, reasons: promotionRejectionReasons(row, {market, now}) }));
  const rejectionCounts = {};
  for (const item of assessed) for (const reason of item.reasons) rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1;
  return { assessed: assessed.length, eligible: assessed.filter(item => !item.reasons.length).length, rejectionCounts,
    signals: array(signals).filter(signal => activeSignal(signal, market, now)).map(signal => {
      const matches = assessed.filter(item => array(signal.queries).some(query => matchesQuery(item.row, query)));
      const rejected = {};
      for (const item of matches) for (const reason of item.reasons) rejected[reason] = (rejected[reason] || 0) + 1;
      return { id:signal.id, title:signal.title, queries:signal.queries, matched:matches.length,
        eligible:matches.filter(item => !item.reasons.length).length, rejectionCounts:rejected,
        examples:matches.filter(item => item.reasons.length).slice(0,3).map(item => ({id:item.row.id,title:item.row.title,reasons:item.reasons,
          linkStatus:item.row.link_last_status ?? null, linkFailures:item.row.link_consecutive_failures ?? 0})) };
    }) };
}
module.exports = { isPromotionEligible, promotionRejectionReasons, promotionExpiresAt, selectMerchandise, merchandisingDiagnostics };
