const {uniqueProductsInOrder} = require("./publicCatalog");
const {discountPercent} = require("./productPresentation");

function ratingSummary(products) {
  const rated = products.filter(product => {
    const rating = Number(product.rating);
    return Number.isFinite(rating) && rating > 0 && rating <= 5;
  });
  return {
    average_rating: rated.length ? rated.reduce((sum, p) => sum + Number(p.rating), 0) / rated.length : null,
    rated_products: rated.length,
    reported_reviews: rated.reduce((sum, p) => {
      const count = Number(p.review_count);
      return sum + (Number.isFinite(count) && count > 0 ? Math.floor(count) : 0);
    }, 0),
  };
}

function summarizeBrands(products) {
  const groups = new Map();
  for (const product of uniqueProductsInOrder(products)) {
    const key = String(product.brand_slug || "").trim();
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push(product);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([brand_slug, products]) => {
    const ratings = ratingSummary(products);
    return {
      brand: products[0].brand, brand_slug, product_count: products.length,
      avg_price: products.reduce((sum, p) => sum + Number(p.current_price || 0), 0) / products.length,
      avg_discount: products.reduce((sum, p) => sum + discountPercent(p), 0) / products.length,
      avg_rating: ratings.average_rating,
      rated_products: ratings.rated_products,
      reported_reviews: ratings.reported_reviews,
    };
  }).sort((a, b) => b.product_count - a.product_count || a.brand.localeCompare(b.brand));
}

module.exports = {ratingSummary, summarizeBrands};
