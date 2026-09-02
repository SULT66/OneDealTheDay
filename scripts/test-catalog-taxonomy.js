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
  /* The aisles the shops we are courting would look at first. */
  [{source:"ebay", category:"", title:"MSI GeForce RTX 4060 Graphics Card"}, "Electronics"],
  [{source:"ebay", category:"", title:"HyperX Cloud II Gaming Headset"}, "Electronics"],
  [{source:"ebay", category:"", title:"Google Nest Learning Smart Thermostat"}, "Electronics"],
  [{source:"ebay", category:"", title:"HP LaserJet Pro Laser Printer"}, "Office"],
  [{source:"ebay", category:"", title:"Lorell 4-Drawer Filing Cabinet"}, "Office"],
  [{source:"ebay", category:"", title:"Milwaukee LED Work Light 2000 Lumen"}, "Tools & DIY"],
  [{source:"ebay", category:"", title:"Werner 6ft Step Ladder"}, "Tools & DIY"],
  [{source:"ebay", category:"", title:"KitchenAid Artisan Stand Mixer 5Qt"}, "Home & Kitchen"],
  [{source:"ebay", category:"", title:"IKEA BILLY Bookshelf"}, "Furniture"],
  [{source:"ebay", category:"", title:"Walker Edison Coffee Table"}, "Furniture"],

  /* The categories that emptied out when the search budget moved. A category
     word cannot compete with a named product for a marketplace attention, and
     these are what the named products come back as. */
  [{source:"ebay", category:"", title:"Furhaven Orthopedic Dog Bed Large"}, "Pet Supplies"],
  [{source:"ebay", category:"", title:"PetSafe Automatic Pet Feeder 6 Meal"}, "Pet Supplies"],
  [{source:"ebay", category:"", title:"Bagail Packing Cubes 6 Set"}, "Travel"],
  [{source:"ebay", category:"", title:"Osprey Farpoint 40 Travel Backpack"}, "Travel"],
  [{source:"ebay", category:"", title:"Garmin Dash Cam 57"}, "Automotive"],
  [{source:"ebay", category:"", title:"Bowflex SelectTech Dumbbell Set"}, "Sports & Outdoors"],
  [{source:"ebay", category:"", title:"Coleman Sundome 4-Person Camping Tent"}, "Sports & Outdoors"],
  /* A television was never Electronics: the rules had no word for one. */
  [{source:"ebay", category:"", title:"LG C4 65-inch OLED evo Smart TV"}, "Electronics"],
  [{source:"ebay", category:"", title:"TCL 75-inch QLED 4K Television"}, "Electronics"],

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

/*
 * A department a source sends can be wrong, and two ways of being wrong put
 * gaming headsets in the car aisle.
 *
 * Newegg's feed labelled 31 listings "Vehicle Parts & Accessories" — every one
 * a gaming headset, not one a vehicle part. For eBay the stored category is
 * the search term that found the listing, so a graphics card whose seller ran
 * out of eBay's 80-character title limit at "ATX Graphics Car" was read as a
 * car part. Measured against the live catalogue, correcting both moved 43
 * listings and left Automotive holding 10, all genuinely car parts.
 */
const misfiled = [
  [{title:"Lenovo Legion H600 Wireless Gaming Headset", category:"Vehicle Parts & Accessories", source:"newegg"}, "Electronics"],
  /* Plural: \b after "headset" refuses the trailing s, so this one stayed put
     even once the contradiction rule existed. */
  [{title:"HyperX CloudX Stinger 2 Core Gaming Headsets Xbox", category:"Vehicle Parts & Accessories", source:"newegg"}, "Electronics"],
  [{title:"GIGABYTE Gaming Radeon RX 9060 XT 8GB GDDR6 PCI Express 5.0 x16 ATX Graphics Car", category:"graphics card", source:"ebay"}, "Electronics"],
  /* The search term is better evidence than an unhelpful title. */
  [{title:"Pen+Gear C227-B 16-Sheet Cross-Cut Wheeled Shredder", category:"paper shredder", source:"ebay"}, "Office"],
  [{title:"Zwilling J.A. Henckels Silvercap 15Pc Block Set", category:"knife set", source:"ebay"}, "Home & Kitchen"],
  /* Real car parts stay where they are. */
  [{title:"4PCS For Toyota Accessories Car PVC Door Sill Scuff Cover Plate", category:"car accessories", source:"ebay"}, "Automotive"],
  [{title:"360 Rotatable Car Phone Mount Holder Universal For Cell Phone", category:"car accessories", source:"ebay"}, "Automotive"],
  /* A title must not overrule a department it does not contradict: preferring
     the title everywhere sent drills sold with "Battery and Charger Included"
     into Electronics, and office chairs described as "Computer Chair" with
     them. */
  [{title:"CRAFTSMAN V20 Cordless Drill/Driver Kit, Battery and Charger Included", category:"cordless drill", source:"ebay"}, "Tools & DIY"],
  [{title:"High Back Leather Office Chair Executive Computer Desk Chair", category:"office chair", source:"ebay"}, "Office"]
];
for (const [product, expected] of misfiled) {
  assert.strictEqual(canonicalCategory(product), expected, `${product.title} was classified incorrectly`);
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
