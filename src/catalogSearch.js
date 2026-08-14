const { scoreOffers, selectUniqueProducts } = require("./ranker");

const SORTS = Object.freeze(["best_match", "price_asc", "price_desc", "newest", "quality"]);
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;

function clean(value, limit = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function fold(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function finiteNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = finiteNumber(value, fallback);
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

function list(value, limit = 20) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(item => clean(item, 80)).filter(Boolean))].slice(0, limit);
}

function isoDate(value) {
  const candidate = clean(value, 40);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  if (!Number.isFinite(timestamp)) throw new Error("updated_after must be a valid ISO date");
  return new Date(timestamp).toISOString();
}

function parseSearchOptions(query = {}) {
  const minimumPrice = finiteNumber(query.min_price ?? query.price_min, null);
  const maximumPrice = finiteNumber(query.max_price ?? query.price_max, null);
  const minimumMatch = finiteNumber(query.min_match, 0);
  const minimumQuality = finiteNumber(query.min_quality, 0);
  const sort = clean(query.sort || "best_match", 30).toLowerCase();
  const availability = clean(query.availability || "available", 20).toLowerCase();
  if (minimumPrice != null && minimumPrice < 0) throw new Error("min_price must be zero or greater");
  if (maximumPrice != null && maximumPrice < 0) throw new Error("max_price must be zero or greater");
  if (minimumPrice != null && maximumPrice != null && minimumPrice > maximumPrice) {
    throw new Error("min_price cannot be greater than max_price");
  }
  if (minimumMatch < 0 || minimumMatch > 100) throw new Error("min_match must be between 0 and 100");
  if (minimumQuality < 0 || minimumQuality > 100) throw new Error("min_quality must be between 0 and 100");
  if (!SORTS.includes(sort)) throw new Error(`sort must be one of: ${SORTS.join(", ")}`);
  if (!["all", "available", "in_stock", "known"].includes(availability)) {
    throw new Error("availability must be one of: all, available, in_stock, known");
  }

  return {
    query:clean(query.q ?? query.query),
    categories:list(query.category ?? query.categories),
    merchants:list(query.merchant ?? query.store ?? query.merchants),
    availability,
    minimumPrice,
    maximumPrice,
    minimumMatch,
    minimumQuality,
    updatedAfter:isoDate(query.updated_after),
    sort,
    page:boundedInteger(query.page, 1, 1, 100000),
    limit:boundedInteger(query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  };
}

function retailer(product) {
  return clean(product.retailer_name || product.source, 100);
}

function totalPrice(product) {
  const landed = finiteNumber(product.landed_cost, null);
  return landed != null && landed > 0 ? landed : finiteNumber(product.current_price, Number.MAX_SAFE_INTEGER);
}

function timestamp(product) {
  return Date.parse(product.updated_at || product.last_seen_at || product.checked_at || "") || 0;
}

function isUnavailable(product) {
  return /\b(?:out of stock|unavailable|expired|ended|sold out)\b/i.test(clean(product.availability));
}

function stableTieBreak(left, right) {
  return fold(left.title).localeCompare(fold(right.title)) || Number(left.id || 0) - Number(right.id || 0);
}

function comparator(sort) {
  if (sort === "price_asc") return (left, right) => totalPrice(left) - totalPrice(right) || stableTieBreak(left, right);
  if (sort === "price_desc") return (left, right) => totalPrice(right) - totalPrice(left) || stableTieBreak(left, right);
  if (sort === "newest") return (left, right) => timestamp(right) - timestamp(left) || stableTieBreak(left, right);
  if (sort === "quality") return (left, right) =>
    Number(right.commerce_quality || 0) - Number(left.commerce_quality || 0) ||
    Number(right.evidence_confidence || 0) - Number(left.evidence_confidence || 0) ||
    stableTieBreak(left, right);
  return (left, right) =>
    Number(right.ranking_score || 0) - Number(left.ranking_score || 0) ||
    Number(right.relevance_score || 0) - Number(left.relevance_score || 0) ||
    Number(right.commerce_quality || 0) - Number(left.commerce_quality || 0) ||
    Number(right.evidence_confidence || 0) - Number(left.evidence_confidence || 0) ||
    stableTieBreak(left, right);
}

function facet(items, accessor) {
  const counts = new Map();
  for (const item of items) {
    const value = clean(accessor(item), 100);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({value, count}))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function searchCatalogProducts(rows, options) {
  const categoryFilters = new Set(options.categories.map(fold));
  const merchantFilters = new Set(options.merchants.map(fold));
  const updatedAfter = options.updatedAfter ? Date.parse(options.updatedAfter) : null;
  const candidates = (rows || [])
    .filter(product => !categoryFilters.size || categoryFilters.has(fold(product.normalized_category || product.category)))
    .filter(product => !merchantFilters.size || merchantFilters.has(fold(retailer(product))) || merchantFilters.has(fold(product.source)))
    .filter(product => options.availability !== "available" || !isUnavailable(product))
    .filter(product => options.availability !== "known" || Boolean(clean(product.availability)))
    .filter(product => options.availability !== "in_stock" || /\b(?:in stock|available)\b/i.test(clean(product.availability)))
    .filter(product => updatedAfter == null || timestamp(product) >= updatedAfter);

  const scored = selectUniqueProducts(scoreOffers(candidates, {
    query:options.query,
    minimumPrice:options.minimumPrice,
    maximumPrice:options.maximumPrice,
    intent:{
      category:options.categories.length === 1 ? options.categories[0] : ""
    }
  }))
    .filter(product => !options.query || Number(product.relevance_score || 0) > 0)
    .filter(product => Number(product.relevance_score || 0) >= options.minimumMatch)
    .filter(product => Number(product.commerce_quality || 0) >= options.minimumQuality)
    .sort(comparator(options.sort));

  const total = scored.length;
  const totalPages = total ? Math.ceil(total / options.limit) : 0;
  const start = (options.page - 1) * options.limit;
  const products = scored.slice(start, start + options.limit);
  return {
    products,
    pagination:{
      page:options.page,
      limit:options.limit,
      total,
      total_pages:totalPages,
      has_previous:options.page > 1 && total > 0,
      has_next:start + options.limit < total
    },
    facets:{
      categories:facet(scored, product => product.normalized_category || product.category),
      merchants:facet(scored, retailer),
      availability:facet(scored, product => product.availability || "Available")
    }
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SORTS,
  parseSearchOptions,
  searchCatalogProducts
};
