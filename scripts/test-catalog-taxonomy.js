const assert = require("assert");
const { TAXONOMY_VERSION, PUBLIC_CATEGORIES, canonicalCategory, normalizeCatalogProduct } = require("../src/catalogTaxonomy");
const { capabilityCoverage, capabilityProfile } = require("../src/sourceCapabilities");

const cases = [
  [{source:"ebay", category:"gifts under 25", title:"Personalized keepsake"}, "Gifts"],
  [{source:"feed-giftlab", category:"Gifts > Personalized Gifts", title:"Custom photo plaque"}, "Gifts"],
  [{source:"ebay", category:"office gadgets", title:"Ergonomic desk lamp"}, "Office"],
  [{source:"feed-tribesigns", category:"Furniture > Office Furniture", title:"Computer desk with drawers"}, "Office"],
  [{source:"feed-tribesigns", category:"Furniture > Shelving > Bookcases", title:"Standing bookcase"}, "Furniture"],
  [{source:"feed-tribesigns", category:"Home & Garden > Household Supplies > Storage", title:"5-tier shoe cabinet"}, "Furniture"],
  [{source:"feed-mooncool", category:"Tricycles", title:"Adult trike"}, "Bikes & Mobility"],
  [{source:"feed-king-koil", category:"Mattresses", title:"Queen mattress"}, "Mattresses & Sleep"],
  [{source:"ebay", category:"maison connectée", title:"Assistant connecté"}, "Electronics"],
  [{source:"ebay", category:"küchengadgets", title:"Praktischer Küchenhelfer"}, "Home & Kitchen"],
  [{source:"ebay", category:"tierbedarf", title:"Zubehör"}, "Pet Supplies"],
  [{source:"ebay", category:"idées cadeaux", title:"Souvenir"}, "Gifts"],
  [{source:"ebay", category:"Tools", title:"Battery replacement kit for Apple iPhone 12"}, "Electronics"],
  [{source:"ebay", category:"Unknown feed path", title:"Opaque listing"}, "Other Deals"]
];

assert.strictEqual(PUBLIC_CATEGORIES.length, 16, "The shopper taxonomy must stay intentionally small");
assert.strictEqual(new Set(PUBLIC_CATEGORIES).size, PUBLIC_CATEGORIES.length, "Public categories must be unique");
assert(!PUBLIC_CATEGORIES.some(category => category.includes(">")), "A raw feed hierarchy escaped into public navigation");

for (const [product, expected] of cases) {
  assert.strictEqual(canonicalCategory(product), expected, `${product.title} was classified incorrectly`);
  const normalized = normalizeCatalogProduct(product);
  assert.strictEqual(normalized.normalized_category, expected);
  assert.strictEqual(normalized.taxonomy_version, TAXONOMY_VERSION);
  assert.strictEqual(normalized.category, product.category, "Raw source category must remain unchanged");
}

const feedRows = [
  {source:"feed-giftlab", rating:0, review_count:0, shipping_summary:"", return_summary:"", availability:"Available"},
  {source:"feed-giftlab", rating:4.8, review_count:12, shipping_summary:"Free shipping", return_summary:"30 days", availability:"Available"}
];
const coverage = capabilityCoverage(feedRows);
assert.strictEqual(coverage.profiles[0].id, "affiliate-product-feed");
assert(coverage.profiles[0].optional.includes("shipping"));
assert.deepStrictEqual(coverage.observed.shipping, {count:1, share:0.5});
assert.deepStrictEqual(coverage.observed.returns, {count:1, share:0.5});
assert.strictEqual(capabilityProfile({source:"ebay"}).id, "ebay-browse-api");
assert.strictEqual(feedRows[0].shipping_summary, "", "Capability reporting must not invent shipping evidence");
assert.strictEqual(feedRows[0].return_summary, "", "Capability reporting must not invent return evidence");

console.log("Catalog taxonomy and honest source capability coverage passed.");
