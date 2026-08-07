const assert = require("assert");
const { createEditorialBrief } = require("../src/editorialBrief");

const product = {
  id: 42,
  market: "us",
  title: "DEWALT DCB206 20V MAX XR 6.0Ah Lithium Ion Battery for Tools, 2 Pack",
  category: "Tools",
  current_price: 119.99,
  original_price: 149.99,
  currency: "USD",
  seller_name: "Verified Tool Seller",
  seller_rating: 99.5,
  seller_feedback_count: 2200,
  shipping_summary: "Free shipping",
  return_summary: "Returns not accepted",
  availability: "In stock",
  rating: 4.7,
  review_count: 45,
  score: 71,
  score_breakdown: JSON.stringify({
    price_quality: 18,
    product_quality: 17,
    review_confidence: 7,
    seller_reliability: 15,
    demand_usefulness: 7,
    shipping_returns: 7
  })
};

const display = {
  ...product,
  display_score: 71,
  display_current_price: "$119.99",
  display_shipping_summary: "Free delivery",
  display_return_summary: "Returns not accepted",
  display_availability: "In stock",
  display_selection_reason: "its current price, product feedback and established seller"
};

for (const language of ["en", "es", "fr", "de"]) {
  const brief = createEditorialBrief(product, display, {
    language,
    store: "eBay",
    marketName: "United States",
    reason: display.display_selection_reason
  });
  assert(brief.wordCount >= 350 && brief.wordCount <= 700, `${language} brief must contain 350-700 useful words; received ${brief.wordCount}`);
  assert.strictEqual(brief.sections.length, 6, `${language} brief must keep the six compact editorial sections`);
  assert.strictEqual(brief.components.length, 6, `${language} brief must explain all Score components`);
  assert(brief.strengths.length >= 2 && brief.watchouts.length >= 1, `${language} brief must separate verified strengths and watch-outs`);
  assert(brief.seoTitle.length <= 70, `${language} SEO title is too long`);
  assert(brief.seoDescription.length <= 158, `${language} SEO description is too long`);
  assert(!/waterproof|lifetime warranty|made in/i.test(brief.sections.flatMap(section => section.paragraphs).join(" ")), `${language} brief invented a product specification`);
}

const unknown = createEditorialBrief({
  ...product,
  description: "",
  rating: 0,
  review_count: 0,
  seller_rating: 0,
  seller_feedback_count: 0
}, {
  ...display,
  description: "",
  rating: 0,
  review_count: 0,
  seller_rating: 0,
  seller_feedback_count: 0
}, { language: "en", store: "Future Store", marketName: "United States", reason: "a checked current offer" });

const unknownText = unknown.sections.flatMap(section => section.paragraphs).join(" ");
assert(unknownText.includes("does not add unverified features"), "Missing descriptions must not be replaced with invented features");
assert(unknownText.includes("not supplied for this listing"), "Missing product and seller evidence must remain unknown");
assert(!unknownText.includes("Price history is still building"), "Editorial copy must not attach price-history confidence language to the Score");

console.log("Stage 4 editorial buying brief checks passed.");
