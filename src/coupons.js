// eBay Browse AvailableCoupon: retain the required message and terms link.
function normalizeCoupons(values, now = Date.now()) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 10).flatMap(value => {
    const code = String(value?.redemptionCode || value?.code || "").trim().slice(0,100);
    const message = String(value?.message || "").trim().slice(0,2000);
    const termsUrl = String(value?.termsWebUrl || value?.termsUrl || "").trim();
    let url;
    try { url = new URL(termsUrl); } catch { return []; }
    if (url.protocol !== "https:") return [];
    const expiresAt = String(value?.constraint?.expirationDate || value?.expiresAt || "").trim();
    if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now)) return [];
    if (!code) return [];
    return [{ code, message, termsUrl: url.href, expiresAt }];
  });
}
function publicCoupons(product, priceIsCurrent) {
  if (!priceIsCurrent) return [];
  try { return normalizeCoupons(JSON.parse(product.coupon_json || "[]")); } catch { return []; }
}
module.exports = { normalizeCoupons, publicCoupons };
