const assert = require("assert");
const { categoryLabel } = require("../src/i18n");
const { presentProduct, publicOneDailyDropScore } = require("../src/productPresentation");

assert.strictEqual(publicOneDailyDropScore(60, 55), 82, "a just-qualified pick must start at 82");
assert.strictEqual(publicOneDailyDropScore(75, 80), 89, "a strong pick must land near 90");
assert.strictEqual(publicOneDailyDropScore(90, 90), 95, "an exceptional pick must cap at 95");
assert.strictEqual(publicOneDailyDropScore(59.9, 100), null, "a weak candidate must not be cosmetically promoted");
assert.strictEqual(publicOneDailyDropScore(100, 54.9), null, "sparse evidence must block a public score");

const fixture = {
  title: "Useful pet grooming tool",
  image_url: "https://example.com/pet-tool.jpg",
  affiliate_url: "https://example.com/pet-tool",
  source: "ebay",
  /* Every product a provider stores carries this; the fixture did not, which
     is why the sentence below could say "eBay" for years without anyone
     noticing it said so on Newegg pages too. */
  retailer_name: "eBay",
  market: "fr",
  category: "pet supplies",
  current_price: 47.62,
  currency: "EUR",
  checked_at: "2026-08-03T00:15:10Z",
  rating: 0,
  review_count: 0,
  seller_name: "sit3203",
  seller_rating: 4.99,
  seller_feedback_count: 12000,
  shipping_summary: "Free shipping via Autre mode d'envoi",
  return_summary: "30 calendar days, seller-paid return shipping",
  availability: "In stock",
  score: 31,
  score_breakdown: JSON.stringify({
    price_quality: 1,
    product_quality: 0,
    review_confidence: 0,
    seller_reliability: 15,
    demand_usefulness: 5,
    shipping_returns: 10
  })
};

const french = presentProduct(fixture, "fr");
assert.strictEqual(french.display_category, "Produits pour animaux");
assert.strictEqual(french.display_shipping_summary, "Livraison gratuite via Autre mode d'envoi");
assert.strictEqual(french.display_return_summary, "Retours acceptés sous 30 jours ; frais de retour payés par le vendeur");
assert.strictEqual(french.display_availability, "En stock");
assert.strictEqual(french.display_badge, "VENDEUR ÉTABLI");
assert(french.display_selection_reason.includes("eBay n’a fourni aucune note produit"));
/* The same listing sold by another shop must not credit eBay for the missing
   rating. Newegg's feed carries no ratings at all, so this sentence appears on
   over half the catalogue. */
const newegg = presentProduct({...fixture, source: "newegg", retailer_name: "Newegg"}, "en");
assert(
  newegg.display_selection_reason.includes("Newegg did not provide a product rating"),
  `A Newegg listing still credits the wrong shop: ${newegg.display_selection_reason}`,
);
assert(
  !newegg.display_selection_reason.includes("eBay"),
  "eBay is still named on a listing that did not come from eBay",
);
assert(!french.display_selection_reason.includes("31/100"));
assert(!french.display_selection_reason.includes("Selected with"));
assert(!french.display_selection_reason.includes("sit3203"));
assert(french.evidence_count >= 4);
assert.strictEqual(french.display_score, null, "an offer below the editorial floor must not expose a weak consumer-facing score");
assert.strictEqual(french.display_evidence_confidence, 40, "evidence coverage must be reported separately from the Deal Score");
assert.strictEqual(french.display_score_label, "Score OneDailyDrop");
assert.strictEqual(french.display_product_rating, "");
assert.strictEqual(french.display_seller_rating, "99,8 % d’avis positifs");
assert(french.display_seller_feedback.includes("12 000") || french.display_seller_feedback.includes("12 000"));

const correctedSnapshot = presentProduct({
  ...fixture,
  drop_score: 77,
  drop_score_model: "current-offer-v7",
  drop_price: 44.62,
  evidence_confidence: 70,
  score_breakdown: JSON.stringify({
    model:"current-offer-v7",
    price_quality:20,
    product_quality:0,
    review_confidence:0,
    seller_reliability:15,
    demand_usefulness:5,
    shipping_returns:10
  })
}, "fr");
assert.strictEqual(correctedSnapshot.display_score, 89, "a qualified snapshot must use the calibrated public score");

const legacySnapshot = presentProduct({...fixture, drop_score:31, drop_price:44.62}, "fr");
assert.notStrictEqual(legacySnapshot.display_score, 31, "a legacy archive snapshot must not expose the obsolete low score");

const german = presentProduct({...fixture, market:"de", category:"car accessories"}, "de");
assert.strictEqual(german.display_category, "Auto");
assert(german.display_shipping_summary.startsWith("Kostenlose Lieferung"));
assert(german.display_return_summary.startsWith("Rückgabe innerhalb von 30 Tagen"));
assert.strictEqual(german.display_score_at_selection_label, "OneDailyDrop-Score bei Auswahl");

const spanish = presentProduct({...fixture, market:"us", category:"office gadgets"}, "es");
assert.strictEqual(spanish.display_category, "Oficina");
assert(spanish.display_shipping_summary.startsWith("Entrega gratuita"));
assert(spanish.display_selection_reason.includes("eBay no facilitó una valoración del producto"));

assert.strictEqual(categoryLabel("Electronics", "fr"), "Électronique");
assert.strictEqual(categoryLabel("Home & Kitchen", "de"), "Wohnen und Küche");


/* ------------------------------------------ a saving is a claim about today */

/*
 * A shopper found an eBay backpack listed here at $79.95 under a badge reading
 * "59% below reference". The seller had raised it to $99.95; our price was two
 * days old, because eBay's American refresh had failed five runs in a row and,
 * even when it succeeds, only re-prices what its keyword rotation happens to
 * rediscover. Of 215 listings carrying a discount badge, 92 were computed from
 * a price older than a day.
 *
 * The price itself may be stale and still be worth showing, with its date. The
 * arithmetic performed on it may not: a percentage off is a claim about right
 * now.
 */
const { presentProduct: present } = require("../src/productPresentation");

const listing = (hoursAgo) => ({
  id: 1,
  title: "Oakley Icon RC Backpack Travel Pack",
  market: "us",
  currency: "USD",
  current_price: 79.95,
  original_price: 195,
  retailer_name: "eBay",
  checked_at: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
});

const freshly = present(listing(1), "en");
assert.strictEqual(freshly.display_price_is_current, true, "a price checked an hour ago is treated as out of date");
assert(freshly.display_save_label, "a freshly checked price stopped showing its saving");

const yesterday = present(listing(50), "en");
assert.strictEqual(yesterday.display_price_is_current, false, "a price two days old is presented as current");
assert.strictEqual(
  yesterday.display_save_label,
  "",
  "a saving is still worked out from a price nobody has confirmed in two days",
);
assert.strictEqual(yesterday.display_off_label, "", "the percentage-off pill survives on a stale price");
/* The price itself stays. Withholding it would leave the page saying nothing
   at all about what the thing costs, which helps nobody. */
assert(yesterday.display_current_price, "the last known price was withheld along with the saving");

/* Nothing to go on is not the same as recently checked. */
assert.strictEqual(
  present({...listing(1), checked_at: ""}, "en").display_price_is_current,
  false,
  "a listing with no check date at all is treated as freshly checked",
);


console.log("Localized product presentation and trust messaging passed.");
