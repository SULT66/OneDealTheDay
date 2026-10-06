const { searchTokens } = require("./ranker");
const NOISE = new Set(["new", "set", "kit", "size", "short", "long", "handle", "inch", "piece", "pack", "black", "white", "red", "blue", "limited"]);
function relatedProducts(product, candidates, limit = 12) {
  const terms = searchTokens(product.title).filter(word => word.length > 2 && !NOISE.has(word) && !/\d/.test(word));
  const scored = candidates.filter(p => p.id !== product.id).map(p => {
    const words = new Set(searchTokens(p.title));
    const shared = terms.filter(word => words.has(word)).length;
    const sameBrand = product.brand && p.brand && product.brand.toLowerCase() === p.brand.toLowerCase();
    return { product: p, shared, score: shared * 10 + (sameBrand ? 5 : 0) };
  }).filter(p => p.shared > 0).sort((a,b) => b.score - a.score);
  return scored.slice(0, limit).map(row => row.product);
}
module.exports = { relatedProducts };
