const { normalizeCoupons } = require("./coupons");
const { discountPercentage } = require("./merchantCoupons");
function officialUrl(value, domain) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null;
  } catch { return null; }
}
function aliTime(value, end) {
  const text = String(value || "").trim();
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(text)) return Date.parse(text);
  if (!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d$/.test(text)) return NaN;
  // The promotion's timezone is unspecified. Only use the intersection of
  // possible UTC-12..UTC+14 windows; never activate early or expire late.
  return Date.parse(text.replace(" ","T") + "Z") + (end ? -14 : 12)*3600000;
}
function aliCoupons(info, now=Date.now()) {
  if (!info) return [];
  const starts = aliTime(info.code_availabletime_start, false);
  const ends = aliTime(info.code_availabletime_end, true);
  const termsUrl = officialUrl(info.code_promotionurl,"aliexpress.com");
  if (!termsUrl || !Number.isFinite(starts) || !Number.isFinite(ends) || starts > now || ends <= now || !info.code_value) return [];
  return normalizeCoupons([{code:info.promo_code, message:String(info.code_value), termsUrl, expiresAt:new Date(ends).toISOString()}],now);
}
function marketplaceOffers(rows, market="us", now=Date.now()) {
  const seen = new Set();
  return rows.flatMap(product => {
    const checked = Date.parse(product.checked_at);
    const domain = product.source === "ebay" ? "ebay.com" : product.source === "aliexpress" ? "aliexpress.com" : null;
    if (!domain || product.market !== market || product.status !== "published" || !product.affiliate_url || !Number.isFinite(checked) || checked > now || now-checked > 86400000) return [];
    let values; try { values = JSON.parse(product.coupon_json || "[]"); } catch { return []; }
    return normalizeCoupons(values,now).flatMap(coupon => {
      if (!officialUrl(coupon.termsUrl,domain) || !coupon.message) return [];
      const key = `${product.source}:${coupon.code}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{id:`${product.source}:${product.id}:${coupon.code}`, merchant:product.source === "ebay" ? "eBay" : "AliExpress",
        code:coupon.code, title:coupon.message, description:"Applies to eligible items only. Confirm the code and any minimum spend at checkout.",
        terms:coupon.message, termsUrl:coupon.termsUrl, expiresAt:coupon.expiresAt,
        checkedAt:product.checked_at, discountPercent:discountPercentage(coupon.message), itemTitle:product.title,
        href:`/go/${encodeURIComponent(product.id)}?market=${encodeURIComponent(market)}`}];
    });
  }).slice(0,100);
}
function listMarketplaceCoupons(db,market="us") {
  const rows = db.prepare(`SELECT id,market,source,status,title,affiliate_url,checked_at,coupon_json
    FROM products WHERE market=? AND source IN ('ebay','aliexpress') AND status='published'
    AND coupon_json IS NOT NULL AND coupon_json != '[]' ORDER BY checked_at DESC LIMIT 2000`).all(market);
  return marketplaceOffers(rows,market);
}
module.exports = {aliCoupons,marketplaceOffers,listMarketplaceCoupons};
