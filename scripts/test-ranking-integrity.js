const assert = require("assert");
const {
  SCORE_MODEL,
  isEligible,
  landedCost,
  paidShippingCost,
  scoreOffers,
  scoreProduct,
  selectUniqueProducts
} = require("../src/ranker");
const {
  identityForProduct,
  normalizeProductIdentity,
  normalizeTradeItemId
} = require("../src/productIdentity");

assert.strictEqual(SCORE_MODEL, "current-offer-v4");
for (const placeholder of ["Does not apply", "Does Not Apply", "Non applicable", "Nicht zutreffend", "不适用", "N/A"]) {
  assert.strictEqual(normalizeTradeItemId(placeholder), "", `Placeholder GTIN was accepted: ${placeholder}`);
}
assert.strictEqual(normalizeTradeItemId("012345678905"), "00012345678905");
assert.strictEqual(normalizeTradeItemId("0-123456-78905"), "00012345678905");
assert.strictEqual(
  identityForProduct({upc:"012345678905"}).productKey,
  identityForProduct({ean:"0012345678905"}).productKey,
  "Equivalent UPC/EAN values did not share one canonical key"
);

const phoneA = identityForProduct({brand:"Acme", model_number:"X-200", capacity:"128 GB", color:"Black", title:"Acme X-200 128GB Black"});
const phoneB = identityForProduct({brand:"ACME", mpn:"X200", title:"Acme X200 Black 128 GB smartphone"});
const phoneC = identityForProduct({brand:"Acme", mpn:"X200", title:"Acme X200 Blue 256 GB smartphone"});
assert.strictEqual(phoneA.productKey, phoneB.productKey, "Brand + model + variant matching is not stable");
assert.notStrictEqual(phoneA.productKey, phoneC.productKey, "Different variants were incorrectly merged");

assert.strictEqual(paidShippingCost({shipping_summary:"CAD 105.31 shipping"}), 105.31);
assert.strictEqual(paidShippingCost({shipping_summary:"Delivery: $105.31"}), 105.31);
assert.strictEqual(paidShippingCost({shipping_summary:"Livraison : 12,50 €"}), 12.5);
assert.strictEqual(paidShippingCost({shipping_summary:"Free shipping"}), 0);
assert.strictEqual(landedCost({current_price:25.21, shipping_summary:"Delivery: $105.31"}), 130.52);

const base = {
  title:"Acme X200 useful product",
  image_url:"https://example.com/product.jpg",
  affiliate_url:"https://example.com/buy",
  availability:"In stock",
  current_price:25.21,
  currency:"CAD",
  rating:4.7,
  review_count:250,
  seller_name:"Acme Store",
  seller_rating:4.9,
  seller_feedback_count:1000,
  return_summary:"30 day returns",
  product_key:"gtin:012345678905"
};
assert.strictEqual(isEligible({...base, shipping_summary:"Delivery: $105.31"}), false, "Shipping above the item price entered ranking");
assert.strictEqual(isEligible({...base, shipping_summary:"CAD 13.00 shipping"}), false, "Shipping above 50% entered ranking");
assert.strictEqual(isEligible({...base, shipping_summary:"CAD 12.00 shipping"}), true);

const missing = scoreProduct({...base, rating:0, review_count:0, original_price:null, shipping_summary:"", return_summary:"", seller_rating:0, seller_feedback_count:0});
assert.strictEqual(missing.breakdown.price_quality, 0, "Missing price evidence received points");
assert.strictEqual(missing.breakdown.product_quality, 0, "Missing rating received points");
assert.strictEqual(missing.breakdown.review_confidence, 0, "Missing reviews received points");
assert(missing.evidenceConfidence < 50, "Sparse evidence received high confidence");

const normalizedPlaceholder = normalizeProductIdentity({...base, product_key:"gtin:Does not apply", gtin:"Does not apply", title:"First unrelated item"});
assert.strictEqual(normalizedPlaceholder.product_key, "", "Placeholder product key survived normalization");
const placeholderOffers = scoreOffers([
  {...base, external_id:"one", product_key:"gtin:Does not apply", gtin:"Does not apply", title:"First unrelated item", original_price:50, shipping_summary:"Free shipping"},
  {...base, external_id:"two", product_key:"gtin:Does not apply", gtin:"Does not apply", title:"Second unrelated item", original_price:50, shipping_summary:"Free shipping"}
], {minimumScore:0, minimumEvidenceConfidence:0, maximumShippingRatio:0.5});
assert.strictEqual(selectUniqueProducts(placeholderOffers).length, 2, "Unrelated placeholder-GTIN products were merged");

const comparable = scoreOffers([
  {...base, external_id:"cheap-item", current_price:100, shipping_summary:"CAD 40.00 shipping", original_price:null},
  {...base, external_id:"lower-total", current_price:120, shipping_summary:"Free shipping", original_price:null}
], {minimumScore:0, minimumEvidenceConfidence:0, maximumShippingRatio:0.5});
const first = comparable.find(product => product.external_id === "cheap-item");
const second = comparable.find(product => product.external_id === "lower-total");
assert(first.landed_cost > second.landed_cost, "Landed cost was not calculated");
assert(first.score < second.score, "Ranking preferred item price over lower landed cost");

console.log("Ranking integrity, identity normalization, landed cost and evidence confidence passed.");
