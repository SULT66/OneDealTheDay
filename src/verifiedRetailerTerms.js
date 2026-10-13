// Reviewed against the merchant's official pages on 2026-10-13.
// Read-time enrichment: raw feed data stays intact and expires automatically.
const REVIEWED_AT = Date.parse('2026-10-13T18:00:00Z');
const EXPIRES_AT = Date.parse('2026-11-12T18:00:00Z');
const SHIPPING_URL = 'https://tribesigns.com/pages/shipping-policy';
const RETURNS_URL = 'https://tribesigns.com/pages/return-policy';
const SHIPPING = 'Free standard delivery to contiguous US, per Tribesigns shipping policy. Excludes Alaska, Hawaii, territories and APO/FPO/DPO; special delivery fees may apply.';
const RETURNS = '30-day returns: unused, original packaging; custom items excluded. Buyer pays return shipping for change of mind, per Tribesigns returns policy.';
const unknown = value => !String(value || '').trim() || /^(?:confirm at retailer|see retailer (?:policy|delivery options)|check (?:at |with )?retailer|unknown)$/i.test(String(value).trim());
function withVerifiedRetailerTerms(product, {now = Date.now()} = {}) {
  if (!product || product.source !== 'feed-tribesigns' || product.market !== 'us' || product.currency !== 'USD' ||
      now < REVIEWED_AT || now >= EXPIRES_AT) return product;
  try {
    const url = new URL(product.retailer_shop_url || '');
    if (url.protocol !== 'https:' || !['tribesigns.com','www.tribesigns.com'].includes(url.hostname)) return product;
  } catch { return product; }
  const enriched = {...product}, sources = [];
  if (product.shipping_cost == null && unknown(product.shipping_summary)) {
    enriched.shipping_cost = 0;
    enriched.shipping_summary = SHIPPING;
    enriched.landed_cost = Number(product.current_price);
    sources.push(SHIPPING_URL);
  }
  if (unknown(product.return_summary) && !/\b(?:custom(?:ized)?|personalized|made to order)\b/i.test(product.title || '')) {
    enriched.return_summary = RETURNS;
    sources.push(RETURNS_URL);
  }
  if (sources.length) {
    enriched.retailer_terms_sources = sources;
    enriched.retailer_terms_reviewed_at = new Date(REVIEWED_AT).toISOString();
    enriched.retailer_terms_expires_at = new Date(EXPIRES_AT).toISOString();
  }
  return enriched;
}
module.exports = {withVerifiedRetailerTerms, unknownRetailerTerms:unknown};
