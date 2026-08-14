const CAPABILITY_FIELDS = Object.freeze({
  rating:product => Number(product.rating) > 0,
  reviews:product => Number(product.review_count) > 0,
  seller_feedback:product => Number(product.seller_rating) > 0 || Number(product.seller_feedback_count) > 0,
  shipping:product => Boolean(String(product.shipping_summary || "").trim()),
  returns:product => Boolean(String(product.return_summary || "").trim()),
  availability:product => Boolean(String(product.availability || "").trim())
});

function capabilityProfile(product = {}) {
  const source = String(product.source || "").toLowerCase();
  if (source === "ebay") return {
    id:"ebay-browse-api",
    guaranteed:["identity", "price", "affiliate_link"],
    optional:Object.keys(CAPABILITY_FIELDS)
  };
  if (source.startsWith("feed-")) return {
    id:"affiliate-product-feed",
    guaranteed:["identity", "price", "affiliate_link"],
    optional:Object.keys(CAPABILITY_FIELDS)
  };
  return {
    id:"retailer-source",
    guaranteed:["identity", "price", "affiliate_link"],
    optional:Object.keys(CAPABILITY_FIELDS)
  };
}

function capabilityCoverage(products = []) {
  const total = products.length;
  const observed = {};
  for (const [name, predicate] of Object.entries(CAPABILITY_FIELDS)) {
    const count = products.filter(predicate).length;
    observed[name] = {count, share:total ? Math.round(count / total * 1000) / 1000 : 0};
  }
  const profiles = [...new Map(products.map(product => {
    const profile = capabilityProfile(product);
    return [profile.id, profile];
  })).values()];
  return {profiles, observed};
}

module.exports = { CAPABILITY_FIELDS, capabilityCoverage, capabilityProfile };
