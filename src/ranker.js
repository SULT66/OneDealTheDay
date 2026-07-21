function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function score(product) {
  const rating = Number(product.rating) || 0;
  const reviews = Number(product.review_count) || 0;
  const position = Number(product.source_rank) || 100;
  const current = Number(product.current_price) || 0;
  const original = Number(product.original_price) || 0;

  return Math.round((
    clamp((rating - 3.5) / 1.5, 0, 1) * 30 +
    clamp(Math.log10(reviews + 1) / 5, 0, 1) * 25 +
    clamp(1 - (position - 1) / 50, 0, 1) * 20 +
    clamp(original > current && current > 0 ? (original - current) / original / 0.5 : 0, 0, 1) * 15 +
    (/best|choice|popular|deal/i.test(String(product.badge || "")) ? 10 : 0)
  ) * 10) / 10;
}

function retailer(product) {
  const source = String(product.source || "").toLowerCase();
  if (source.includes("walmart") || source.includes("bluecart")) return "walmart";
  if (source.includes("amazon") || source.includes("rainforest")) return "amazon";
  return source || "other";
}

function normalizedTitle(title) {
  return String(title || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(newest|new|renewed|refurbished|amazon|walmart|exclusive|pack|count)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(title) {
  return new Set(
    normalizedTitle(title)
      .split(" ")
      .filter(token => token.length > 2)
  );
}

function similarity(left, right) {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;

  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function exactMatchKey(product) {
  const value =
    product.product_key ||
    product.gtin ||
    product.upc ||
    product.ean ||
    product.model_number ||
    product.model;

  return value
    ? String(value).toLowerCase().replace(/[^a-z0-9]/g, "")
    : "";
}

function prepare(items) {
  const unique = new Map();

  for (const item of items || []) {
    if (!item?.title || !item?.image_url || !item?.affiliate_url) continue;

    const key = `${retailer(item)}:${item.external_id || item.title}`;
    unique.set(key, { ...item, score: score(item) });
  }

  return [...unique.values()].sort((a, b) => b.score - a.score);
}

function findComparisonPairs(amazon, walmart) {
  const pairs = [];
  const usedAmazon = new Set();
  const usedWalmart = new Set();

  for (let amazonIndex = 0; amazonIndex < amazon.length; amazonIndex += 1) {
    const amazonProduct = amazon[amazonIndex];
    const amazonExact = exactMatchKey(amazonProduct);
    let bestMatch = null;

    for (let walmartIndex = 0; walmartIndex < walmart.length; walmartIndex += 1) {
      if (usedWalmart.has(walmartIndex)) continue;

      const walmartProduct = walmart[walmartIndex];
      const walmartExact = exactMatchKey(walmartProduct);
      const exact = Boolean(amazonExact && walmartExact && amazonExact === walmartExact);
      const titleScore = similarity(amazonProduct.title, walmartProduct.title);

      if (!exact && titleScore < 0.72) continue;

      const matchScore = exact ? 2 : titleScore;
      if (!bestMatch || matchScore > bestMatch.matchScore) {
        bestMatch = { walmartIndex, walmartProduct, matchScore };
      }
    }

    if (bestMatch) {
      usedAmazon.add(amazonIndex);
      usedWalmart.add(bestMatch.walmartIndex);
      pairs.push({
        amazon: amazonProduct,
        walmart: bestMatch.walmartProduct,
        score: Math.max(Number(amazonProduct.score) || 0, Number(bestMatch.walmartProduct.score) || 0),
        exact: bestMatch.matchScore === 2
      });
    }
  }

  return pairs.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    return b.score - a.score;
  });
}

exports.rankProducts = (items, limit = 10) => {
  const ranked = prepare(items);
  const amazon = ranked.filter(product => retailer(product) === "amazon");
  const walmart = ranked.filter(product => retailer(product) === "walmart");

  if (!amazon.length || !walmart.length) return ranked.slice(0, limit);

  const selected = [];
  const selectedKeys = new Set();
  const keyFor = product => `${retailer(product)}:${product.external_id || product.title}`;
  const add = product => {
    const key = keyFor(product);
    if (selected.length >= limit || selectedKeys.has(key)) return;
    selected.push(product);
    selectedKeys.add(key);
  };

  const pairs = findComparisonPairs(amazon, walmart);
  const maximumPairProducts = Math.min(limit, 12);

  for (const pair of pairs) {
    if (selected.length + 2 > maximumPairProducts) break;
    add(pair.amazon);
    add(pair.walmart);
  }

  const amazonQuota = Math.ceil(limit / 2);
  const walmartQuota = Math.floor(limit / 2);

  for (let index = 0; selected.length < limit && (index < amazon.length || index < walmart.length); index += 1) {
    const amazonCount = selected.filter(product => retailer(product) === "amazon").length;
    const walmartCount = selected.filter(product => retailer(product) === "walmart").length;

    if (index < amazon.length && amazonCount < amazonQuota) add(amazon[index]);
    if (index < walmart.length && walmartCount < walmartQuota) add(walmart[index]);
  }

  for (const product of ranked) {
    add(product);
    if (selected.length >= limit) break;
  }

  return selected.slice(0, limit);
};
