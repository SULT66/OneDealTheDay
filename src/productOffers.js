const RELIABLE_MATCH_TYPES = new Set(["gtin", "brand-model-variant", "provider-product"]);

function text(value) {
  return String(value == null ? "" : value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sourceKey(product = {}) {
  return text(product.source_catalog_id || product.source || product.provider).toLowerCase();
}

function merchantKey(product = {}) {
  return text(product.retailer_name || product.seller_name || sourceKey(product)).toLowerCase();
}

function offerIdentity(product = {}) {
  const productKey = text(product.product_key).toLowerCase();
  if (/^gtin:\d{14}$/.test(productKey)) {
    return { reliable:true, matchType:"gtin", productKey, sourceScoped:false };
  }
  if (/^bmv:[a-z0-9]+:[a-z0-9]+(?::[a-z0-9-]+)?$/.test(productKey)) {
    return { reliable:true, matchType:"brand-model-variant", productKey, sourceScoped:false };
  }
  if (/^(?:epid|asin|sku):[a-z0-9]+$/.test(productKey)) {
    return { reliable:true, matchType:"provider-product", productKey, sourceScoped:true };
  }
  return { reliable:false, matchType:"single-offer", productKey:"", sourceScoped:false };
}

function sameReliableEntity(anchor = {}, candidate = {}) {
  const identity = offerIdentity(anchor);
  if (!identity.reliable || text(candidate.market).toLowerCase() !== text(anchor.market).toLowerCase()) return false;
  const candidateIdentity = offerIdentity(candidate);
  if (!candidateIdentity.reliable || candidateIdentity.productKey !== identity.productKey) return false;
  return !identity.sourceScoped || sourceKey(candidate) === sourceKey(anchor);
}

function offerCost(product = {}) {
  const landed = Number(product.landed_cost);
  if (Number.isFinite(landed) && landed > 0) return landed;
  const price = Number(product.current_price);
  const shipping = Number(product.shipping_cost);
  return Number.isFinite(price) && price > 0 ? price + (Number.isFinite(shipping) && shipping > 0 ? shipping : 0) : Number.POSITIVE_INFINITY;
}

function distinctReliableOffers(anchor = {}, candidates = []) {
  const identity = offerIdentity(anchor);
  if (!identity.reliable) return { identity, offers:[anchor] };
  const seen = new Set();
  const offers = [];
  for (const candidate of candidates) {
    if (!sameReliableEntity(anchor, candidate)) continue;
    const offerKey = [
      sourceKey(candidate),
      text(candidate.provider_external_id || candidate.external_id || candidate.id).toLowerCase(),
      merchantKey(candidate),
      text(candidate.seller_name).toLowerCase()
    ].join(":");
    if (seen.has(offerKey)) continue;
    seen.add(offerKey);
    offers.push(candidate);
  }
  if (!offers.some(offer => Number(offer.id) === Number(anchor.id))) offers.push(anchor);
  offers.sort((left, right) => offerCost(left) - offerCost(right) || Number(right.score || 0) - Number(left.score || 0));
  return { identity, offers };
}

function offerSummary(anchor = {}, candidates = []) {
  const result = distinctReliableOffers(anchor, candidates);
  return {
    ...result,
    offerCount:result.offers.length,
    merchantCount:new Set(result.offers.map(merchantKey).filter(Boolean)).size,
    bestOffer:result.offers[0] || anchor
  };
}

module.exports = {
  RELIABLE_MATCH_TYPES,
  distinctReliableOffers,
  offerCost,
  offerIdentity,
  offerSummary,
  sameReliableEntity,
  sourceKey
};
