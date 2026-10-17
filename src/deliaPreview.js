const {assistantProduct} = require("./shoppingAssistant");

function catalogPreview({db, sourceSql, productId, market, language, t}) {
  if (!/^\d+$/.test(String(productId ?? ""))) return null;
  const row = db.prepare("SELECT * FROM products WHERE id=? AND market=? AND status='published' AND " + sourceSql()).get(Number(productId), market);
  if (!row) return null;
  const p = assistantProduct(row, language);
  return {
    message: t(language, "app.delia.preview"), message_source: "template", result_state: "exact_matches", partial: true,
    recommendations: [{
      title: p.title, retailer: p.retailer, price: "", price_value: p.price, currency: p.currency,
      source_type: "catalog", catalog_product_id: p.id, url: p.url, image_url: p.image_url,
      score: p.score, rating: p.rating, reviews: p.reviews, delivery: p.delivery,
      returns: p.returns, availability: p.availability, badge: "", reason: "", action_label: ""
    }],
    partial_offers: [], comparison: [], comparison_notes: [], clarifying_questions: [], clarification_prompts: [], follow_up: ""
  };
}
module.exports = {catalogPreview};
