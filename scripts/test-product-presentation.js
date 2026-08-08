const assert = require("assert");
const { categoryLabel } = require("../src/i18n");
const { presentProduct } = require("../src/productPresentation");

const fixture = {
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
assert(!french.display_selection_reason.includes("31/100"));
assert(!french.display_selection_reason.includes("Selected with"));
assert(!french.display_selection_reason.includes("sit3203"));
assert(french.evidence_count >= 4);
assert.strictEqual(french.display_score, 59, "a stored score from the old model must be recalibrated immediately");
assert.strictEqual(french.display_score_label, "Score OneDailyDrop");
assert.strictEqual(french.display_product_rating, "");
assert.strictEqual(french.display_seller_rating, "99,8 % d’avis positifs");
assert(french.display_seller_feedback.includes("12 000") || french.display_seller_feedback.includes("12 000"));

const correctedSnapshot = presentProduct({
  ...fixture,
  drop_score: 77,
  drop_score_model: "current-offer-v3",
  drop_price: 44.62
}, "fr");
assert.strictEqual(correctedSnapshot.display_score, 77, "a snapshot saved by the current model must keep its selection score");

const legacySnapshot = presentProduct({...fixture, drop_score:31, drop_price:44.62}, "fr");
assert.notStrictEqual(legacySnapshot.display_score, 31, "a legacy archive snapshot must not expose the obsolete low score");

const german = presentProduct({...fixture, market:"de", category:"car accessories"}, "de");
assert.strictEqual(german.display_category, "Autozubehör");
assert(german.display_shipping_summary.startsWith("Kostenlose Lieferung"));
assert(german.display_return_summary.startsWith("Rückgabe innerhalb von 30 Tagen"));
assert.strictEqual(german.display_score_at_selection_label, "OneDailyDrop-Score bei Auswahl");

const spanish = presentProduct({...fixture, market:"us", category:"office gadgets"}, "es");
assert.strictEqual(spanish.display_category, "Accesorios de oficina");
assert(spanish.display_shipping_summary.startsWith("Entrega gratuita"));
assert(spanish.display_selection_reason.includes("eBay no facilitó una valoración del producto"));

assert.strictEqual(categoryLabel("smart home", "fr"), "Maison connectée");
assert.strictEqual(categoryLabel("kitchen gadgets", "de"), "Küchenhelfer");

console.log("Localized product presentation and trust messaging passed.");
