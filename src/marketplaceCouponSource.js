// Marketplace APIs can provide item-specific coupon codes even when a
// public coupon landing page blocks automated requests. These codes are
// validated by marketplaceCoupons (expiry, official terms, recent check).
// This is a local inventory check, not a claim to have scraped a source.
function createMarketplaceCouponSource(list) {
  return {
    isConfigured: () => true,
    async refreshCoupons() {
      const offers = list("us");
      const active = Array.isArray(offers) ? offers.length : 0;
      return {status:active ? "success" : "empty",active,received:active};
    }
  };
}
module.exports={createMarketplaceCouponSource};
