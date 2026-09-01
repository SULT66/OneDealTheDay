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
  [{source:"ebay", category:"Unknown feed path", title:"Opaque listing"}, "Other Deals"],

  /*
   * The words these products are actually sold under. A partner review found
   * Electronics holding 19 listings and Home & Kitchen 7 while every one of
   * these sat in Other Deals, because the rules asked for phrases like "power
   * drill" that no real listing writes.
   */
  [{source:"ebay", category:"", title:"DEWALT 20V MAX Cordless Drill Driver Kit"}, "Tools & DIY"],
  [{source:"ebay", category:"", title:"Stanley 25ft Tape Measure"}, "Tools & DIY"],
  [{source:"ebay", category:"", title:"Samsung 1TB 990 EVO NVMe M.2 Internal SSD"}, "Electronics"],
  [{source:"ebay", category:"", title:"Logitech MX Master 3S Wireless Mouse"}, "Electronics"],
  [{source:"ebay", category:"", title:"Anker 10000mAh Power Bank"}, "Electronics"],
  [{source:"ebay", category:"", title:"OXO Good Grips 3-Piece Mixing Bowl Set"}, "Home & Kitchen"],
  [{source:"ebay", category:"", title:"Shark Navigator Vacuum Cleaner"}, "Home & Kitchen"],
  [{source:"ebay", category:"", title:"HP OfficeJet Pro 9015e All-in-One Printer"}, "Office"],
  [{source:"ebay", category:"", title:"Fellowes Powershred Paper Shredder"}, "Office"],

  /*
   * And the two the widening could easily have broken. A bare "mouse" would
   * file a cat toy under Electronics and a bare "monitor" would do the same to
   * a baby monitor, which is why both are written narrowly.
   */
  [{source:"ebay", category:"", title:"Cat Toy Mouse with Feathers"}, "Pet Supplies"],
  [{source:"ebay", category:"", title:"Infant Optics Baby Monitor"}, "Baby & Kids"]
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
