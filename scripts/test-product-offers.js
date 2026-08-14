const assert = require("assert");
const {
  offerIdentity,
  offerSummary,
  sameReliableEntity
} = require("../src/productOffers");

const base = {
  id:1,
  market:"us",
  source:"ebay",
  retailer_name:"eBay",
  seller_name:"Seller A",
  provider_external_id:"offer-a",
  product_key:"gtin:00012345678905",
  current_price:39.99,
  shipping_cost:0
};
const secondStore = {
  ...base,
  id:2,
  source:"awin-store",
  retailer_name:"Store B",
  seller_name:"Store B",
  provider_external_id:"offer-b",
  current_price:34.99
};
const wrongVariant = {...secondStore, id:3, product_key:"gtin:00040063813339"};
const titleOnly = {...base, id:4, product_key:"", title:"Same words are not enough"};

assert.strictEqual(offerIdentity(base).matchType, "gtin");
assert.strictEqual(sameReliableEntity(base, secondStore), true, "Validated GTIN offers were not matched");
assert.strictEqual(sameReliableEntity(base, wrongVariant), false, "Different GTINs were merged");
assert.strictEqual(offerSummary(titleOnly, [titleOnly, {...titleOnly, id:5}]).offerCount, 1, "Unidentified products were merged");

const gtinSummary = offerSummary(base, [base, secondStore, wrongVariant]);
assert.strictEqual(gtinSummary.offerCount, 2);
assert.strictEqual(gtinSummary.merchantCount, 2);
assert.strictEqual(gtinSummary.bestOffer.id, 2, "Offers are not sorted by current landed cost");

const providerA = {...base, product_key:"epid:123456", provider_external_id:"ebay-a"};
const providerB = {...providerA, id:6, provider_external_id:"ebay-b", seller_name:"Seller B", current_price:31};
const providerLeak = {...providerB, id:7, source:"awin-store", retailer_name:"Store B"};
assert.strictEqual(offerSummary(providerA, [providerA, providerB, providerLeak]).offerCount, 2, "Provider identifiers leaked across sources");

const queen = {...base, product_key:"bmv:acme:bed900:queen"};
const queenStore = {...secondStore, product_key:"bmv:acme:bed900:queen"};
const kingStore = {...secondStore, id:8, product_key:"bmv:acme:bed900:king"};
assert.strictEqual(offerSummary(queen, [queen, queenStore, kingStore]).offerCount, 2, "Brand/model/variant matching ignored the variant");

console.log("Day 11 product/offer matching passed: only validated identities produce multiple offers.");
