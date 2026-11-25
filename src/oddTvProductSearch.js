const { editDistance } = require("./searchFallback");

function words(text) {
  return String(text ?? "").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function wordMatch(token, word, isSingleWordBrand = false) {
  if (word === token) return 8;
  if (word.startsWith(token)) return isSingleWordBrand ? 7 : 5;
  if (token.length >= 4 && /^\p{L}+$/u.test(token)) {
    if (editDistance(token, word, 1) === 1) return isSingleWordBrand ? 6 : 4;
    if (isSingleWordBrand && word.length === token.length + 1 && token[0] === word[0] &&
        editDistance(token, word.slice(0, token.length), 1) === 1) return 6;
  }
  return word.includes(token) ? 1 : 0;
}

function tokenMatcher(token) {
  const productMatches = new Map();
  const brandMatches = new Map();

  return function match(productWords, brandWords, storeWords) {
    const brandWord = brandWords.length === 1 ? brandWords[0] : null;
    if (brandWord && !brandMatches.has(brandWord)) {
      brandMatches.set(brandWord, wordMatch(token, brandWord, true));
    }
    const listingWords = new Set([...productWords, ...brandWords]);
    for (const word of listingWords) {
      if (!productMatches.has(word)) productMatches.set(word, wordMatch(token, word));
    }
    return Math.max(brandMatches.get(brandWord) || 0,
      ...productWords.map(word => productMatches.get(word)),
      ...brandWords.map(word => Math.max(0, productMatches.get(word) - 1)),
      storeWords.some(word => word.includes(token)) ? 1 : 0);
  };
}

function searchOddTvProducts(db, { market, query, sourceFilter }) {
  const tokens = words(String(query ?? "").trim().slice(0, 120));
  if (tokens.join("").length < 2) return [];
  const matchers = [...new Set(tokens)].slice(0, 8).map(tokenMatcher);
  const rows = db.prepare(`
    SELECT id,title,brand,retailer_name,current_price AS price,currency,image_url
    FROM products
    WHERE market=? AND status='published' AND ${sourceFilter}
    ORDER BY COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC,id
  `).all(market);
  const matches = [];
  for (const product of rows) {
    const title = words(product.title);
    const brand = words(product.brand);
    const store = words(product.retailer_name);
    let score = 0;
    for (const match of matchers) {
      const relevance = match(title, brand, store);
      if (!relevance) {
        score = 0;
        break;
      }
      score += relevance;
    }
    // A missing search word disqualifies the listing.
    if (score) matches.push({ product, score });
  }
  return matches.sort((left, right) => right.score - left.score)
    .slice(0, 20).map(result => result.product);
}

module.exports = { searchOddTvProducts };
