const assert = require("assert");
const {
  canonicalMerchantProductUrl,
  identityForProduct,
  normalizeProductIdentity,
  normalizeTradeItemId,
  sourceGroupKey,
  sourceVariantKey
} = require("../src/productIdentity");
const {
  deduplicationCandidateKeys,
  deduplicationKeys,
  selectUniqueProducts
} = require("../src/ranker");

assert.strictEqual(normalizeTradeItemId("012345678905"), "00012345678905");
assert.strictEqual(normalizeTradeItemId("012345678904"), "", "Invalid GTIN checksum was accepted");

const productUrlA = "https://Example.com/products/desk/?variant=111&utm_source=awin&color=black";
const productUrlB = "https://example.com/products/desk?color=black&variant=222&utm_campaign=sale";
assert.strictEqual(
  canonicalMerchantProductUrl(productUrlA),
  canonicalMerchantProductUrl(productUrlB),
  "Variant/tracking parameters changed the canonical merchant product URL"
);

const sourceVariantA = {
  source:"feed-store-a",
  market:"us",
  retailer_name:"Store A",
  external_id:"variant-111",
  title:"Modern Office Desk Black",
  retailer_shop_url:productUrlA
};
const sourceVariantB = {
  ...sourceVariantA,
  external_id:"variant-222",
  title:"Modern Office Desk White",
  retailer_shop_url:productUrlB
};
assert.strictEqual(sourceGroupKey(sourceVariantA), sourceGroupKey(sourceVariantB));
assert.notStrictEqual(sourceVariantKey(sourceVariantA), sourceVariantKey(sourceVariantB));
assert.strictEqual(selectUniqueProducts([sourceVariantA, sourceVariantB]).length, 1, "Same-source variants were not grouped into one card");

const otherMerchant = {
  ...sourceVariantB,
  source:"feed-store-b",
  retailer_name:"Store B",
  external_id:"store-b-variant"
};
assert.strictEqual(selectUniqueProducts([sourceVariantA, otherMerchant]).length, 2, "Merchant URL grouping leaked across sources");

const explicitGroupA = {...sourceVariantA, retailer_shop_url:"", source_group_key:"desk-family"};
const explicitGroupB = {...otherMerchant, retailer_shop_url:"", source_group_key:"desk-family"};
assert.notStrictEqual(sourceGroupKey(explicitGroupA), sourceGroupKey(explicitGroupB), "Unscoped source-group IDs leaked across merchants");
const normalizedExplicitGroup = normalizeProductIdentity(explicitGroupA);
assert.strictEqual(
  sourceGroupKey(normalizedExplicitGroup),
  normalizedExplicitGroup.source_group_key,
  "Source-group normalization was not idempotent"
);

const exactA = {
  source:"ebay",
  market:"us",
  external_id:"ebay-1",
  title:"Acme Travel Adapter",
  gtin:"012345678905"
};
const exactB = {
  source:"feed-store-a",
  market:"us",
  external_id:"awin-1",
  title:"Acme International Travel Adapter",
  upc:"0-123456-78905"
};
assert.strictEqual(selectUniqueProducts([exactA, exactB]).length, 1, "Validated GTIN did not merge cross-merchant offers");

const modelA = {
  source:"feed-store-a",
  market:"us",
  external_id:"queen-a",
  brand:"Acme",
  mpn:"BED-900",
  size:"Queen",
  title:"Acme Bed 900 Queen"
};
const modelB = {
  ...modelA,
  source:"feed-store-b",
  external_id:"queen-b",
  model_number:"BED900",
  mpn:""
};
const modelC = {...modelB, external_id:"king-b", size:"King", title:"Acme Bed 900 King"};
assert.strictEqual(identityForProduct(modelA).productKey, identityForProduct(modelB).productKey);
assert.strictEqual(selectUniqueProducts([modelA, modelB]).length, 1, "Brand + model + variant did not merge equivalent offers");
assert.strictEqual(selectUniqueProducts([modelA, modelC]).length, 2, "Different size variants were merged across merchants");

const titleCandidateA = {
  source:"feed-store-a",
  market:"us",
  external_id:"candidate-a",
  brand:"Acme",
  category:"Office Furniture",
  gtin:"036000291452",
  title:"Acme Industrial Writing Desk with Storage Shelf"
};
const titleCandidateB = {
  ...titleCandidateA,
  source:"feed-store-b",
  external_id:"candidate-b",
  gtin:"4006381333931"
};
assert.deepStrictEqual(deduplicationCandidateKeys(titleCandidateA), deduplicationCandidateKeys(titleCandidateB));
assert.strictEqual(selectUniqueProducts([titleCandidateA, titleCandidateB]).length, 2, "Title candidate became an automatic merge");
assert(!deduplicationKeys(titleCandidateA).some(key => key.startsWith("title:") || key.startsWith("family:")));

const kingKoilVariants = Array.from({length:29}, (_, index) => ({
  source:"feed-king-koil",
  market:"us",
  retailer_name:"King Koil",
  external_id:`variant-${index + 1}`,
  title:"King Koil Luxury Air Mattress with High Speed Built-in Pump",
  retailer_shop_url:`https://kingkoilairbeds.com/products/king-koil-luxury-air-mattress?variant=${40196727636056 + index}`
}));
assert.strictEqual(selectUniqueProducts(kingKoilVariants).length, 1, "King Koil source variants did not group into one family");

console.log("Day 3 dedup rules passed: validated identity, source grouping, variants, candidates and title-only safety.");
