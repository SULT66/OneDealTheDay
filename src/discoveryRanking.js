// Recommendation order is separate from the public evidence-based Deal Score.
// Missing feed data is neutral, never fabricated as a rating or merchant trust.
const { productType } = require('./productVariety');
const clamp = n => Math.max(0, Math.min(1, n));
const num = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const text = n => String(n || '');
function recommendationScore(p) {
  const price = num(p.current_price ?? p.price);
  const shipping = num(p.shipping_cost);
  const average = num(p.average_30_day_price || p.average_90_day_price);
  const median = num(p.comparable_offer_count) >= 2 ? num(p.comparable_median_price) : 0;
  const reference = median || average;
  // Seller list prices are not evidence of a market bargain.
  const value = reference > 0 && price > 0 ? clamp(0.5 + (reference - price - shipping) / reference * 2) : 0.5;
  const title = text(p.title);
  let useful = 0.5;
  if (title.trim().split(/\s+/).length >= 3) useful += 0.15;
  if (price > 0 && price <= 200) useful += 0.15;
  // Everyday consumables and installation-dependent parts belong in their
  // categories; they should not dominate a general discovery shelf.
  if (/\b(printer paper|ink cartridge|toner|ream|replacement parts?)\b/i.test(title)) useful -= 0.3;
  if (/\b(recessed|in.wall|thermostat)\b/i.test(title)) useful -= 0.15;
  const seller = num(p.seller_rating ?? p.seller?.positivePct);
  const trust = seller > 5 ? clamp((seller - 80) / 20) : seller > 0 ? clamp((seller - 3.5) / 1.5) : 0.5;
  const delivery = text(p.shipping_summary ?? p.delivery);
  const returns = text(p.return_summary ?? p.returns);
  const noReturns = /\b(no returns|not accepted|final sale)\b/i.test(returns);
  const fulfillment = ((/\bfree (shipping|delivery)\b/i.test(delivery) ? 1 : 0.5) +
    (noReturns ? 0 : /\b(\d+.?day|returns accepted|refund)\b/i.test(returns) ? 1 : 0.5)) / 2;
  const reviews = num(p.review_count ?? p.reviewCount);
  const rating = num(p.rating);
  const quality = rating > 0 ? clamp(((rating * reviews + 4.2 * 20) / (reviews + 20) - 3) / 2) : 0.5;
  return Math.round((value * 30 + clamp(useful) * 25 + trust * 20 + fulfillment * 15 + quality * 10) * 100) / 100;
}
function merchant(p) { return text(p.retailer_name || p.retailer || p.source).trim().toLowerCase(); }
function discoveryEligible(p) {
  const seller = num(p.seller_rating ?? p.seller?.positivePct);
  const checked = p.checked_at || p.checkedAt;
  const current = !checked || (Number.isFinite(Date.parse(checked)) && Date.now()-Date.parse(checked) <= 48*3600000);
  return current && num(p.current_price ?? p.price) > 0 && Boolean(p.image_url || p.image) && Boolean(merchant(p)) &&
    p.display_price_is_current !== false && p.priceIsCurrent !== false &&
    !/\b(out of stock|sold out|unavailable|expired|ended|pre.?order)\b/i.test(`${text(p.availability)} ${text(p.title)}`) &&
    !/\b(no returns|not accepted|final sale)\b/i.test(text(p.return_summary ?? p.returns)) &&
    !(num(p.rating) > 0 && num(p.rating) < 3.8) &&
    !(seller > 0 && (seller > 5 ? seller < 95 : seller < 4.5));
}
// Diversify a bounded first screen, then retain every remaining listing.
// A quality floor prevents weak offers being promoted just to fill a quota.
function discoveryOrder(items, { limit = items.length, perRetailer = 4, perCategory = 3, shelf = false } = {}) {
  const scores = new Map(items.map(p=>[p, num(p.recommendationScore ?? p.recommendation_score) || recommendationScore(p)]));
  const score = p => scores.get(p) ?? 0;
  const sorted = [...items].sort((a,b) => score(b)-score(a) || text(a.id).localeCompare(text(b.id), undefined, {numeric:true}));
  const candidates = sorted.filter(discoveryEligible);
  const floor = 50;
  const picked = [], used = new Set(), shops = new Map(), categories = new Map(), types = new Map();
  const shopCount = new Set(candidates.filter(p=>score(p)>=floor).map(merchant)).size;
  const cap = shopCount > 1 ? perRetailer : 12;
  const firstScreen = Math.min(limit, 12);
  while (picked.length < firstScreen) {
    let best, bestValue = -Infinity;
    for (const p of candidates) {
      if (used.has(p) || score(p) < floor) continue;
      const shop = merchant(p), category = p.category || p.normalized_category || p.public_category || '', type = productType(p);
      if ((shops.get(shop)||0) >= cap || (categories.get(category)||0) >= perCategory || (type && (types.get(type)||0) >= 1)) continue;
      const value = score(p) - (shops.get(shop)||0)*6 - (categories.get(category)||0)*3;
      if (value > bestValue) { best = p; bestValue = value; }
    }
    if (!best) break;
    picked.push(best); used.add(best);
    const shop = merchant(best), category = best.category || best.normalized_category || best.public_category || '', type = productType(best);
    shops.set(shop,(shops.get(shop)||0)+1); categories.set(category,(categories.get(category)||0)+1); if(type) types.set(type,1);
  }
  return shelf ? picked : [...picked, ...sorted.filter(p=>!used.has(p))].slice(0,limit);
}
module.exports = { recommendationScore, discoveryEligible, discoveryOrder };
