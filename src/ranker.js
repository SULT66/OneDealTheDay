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
    (/best|choice|popular|deal/i.test(product.badge || "") ? 10 : 0)
  ) * 10) / 10;
}

function retailer(product) {
  const source = String(product.source || "").toLowerCase();
  if (source.includes("walmart") || source.includes("bluecart")) return "walmart";
  if (source.includes("amazon") || source.includes("rainforest")) return "amazon";
  return source || "other";
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

exports.rankProducts = (items, limit = 10) => {
  const ranked = prepare(items);
  const amazon = ranked.filter(product => retailer(product) === "amazon");
  const walmart = ranked.filter(product => retailer(product) === "walmart");

  if (!amazon.length || !walmart.length) return ranked.slice(0, limit);

  const amazonQuota = Math.ceil(limit / 2);
  const walmartQuota = Math.floor(limit / 2);
  const selected = [
    ...amazon.slice(0, amazonQuota),
    ...walmart.slice(0, walmartQuota)
  ];

  if (selected.length < limit) {
    const selectedKeys = new Set(selected.map(product => `${retailer(product)}:${product.external_id || product.title}`));
    for (const product of ranked) {
      const key = `${retailer(product)}:${product.external_id || product.title}`;
      if (!selectedKeys.has(key)) {
        selected.push(product);
        selectedKeys.add(key);
      }
      if (selected.length >= limit) break;
    }
  }

  return selected.slice(0, limit);
};