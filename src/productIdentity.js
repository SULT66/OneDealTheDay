const PLACEHOLDER_PATTERN = /^(?:n\s*a|na|none|null|unknown|not\s+(?:applicable|specified)|does\s+not\s+apply|non\s+applicable|nicht\s+(?:zutreffend|anwendbar)|keine\s+angabe|sans\s+objet|ne\s+s\s+applique\s+pas|no\s+aplica|不适用)$/i;
const TRADE_ITEM_LENGTHS = new Set([8, 12, 13, 14]);

function text(value) {
  return String(value == null ? "" : value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedPart(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function isPlaceholder(value) {
  const candidate = text(value).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  return !candidate || PLACEHOLDER_PATTERN.test(candidate);
}

function normalizeTradeItemId(value) {
  let candidate = text(value).replace(/^(?:gtin|upc|ean)\s*:/i, "").trim();
  if (isPlaceholder(candidate)) return "";
  candidate = candidate.replace(/[^0-9]/g, "");
  if (!TRADE_ITEM_LENGTHS.has(candidate.length) || /^0+$/.test(candidate)) return "";
  return candidate.padStart(14, "0");
}

function validProviderKey(value) {
  const candidate = text(value).toLowerCase();
  const match = candidate.match(/^(epid|asin|sku):(.+)$/);
  if (!match || isPlaceholder(match[2])) return "";
  const normalized = normalizedPart(match[2]);
  return normalized.length >= 4 ? `${match[1]}:${normalized}` : "";
}

function modelPart(product) {
  const raw = product?.model_number || product?.model || product?.mpn || product?.part_number;
  if (isPlaceholder(raw)) return "";
  const normalized = normalizedPart(raw);
  return normalized.length >= 3 ? normalized : "";
}

function brandPart(product) {
  const raw = product?.brand || product?.manufacturer;
  if (isPlaceholder(raw) || /^(?:unbranded|generic|no\s+brand|sans\s+marque(?:\s*\/\s*g[ée]n[ée]rique)?|g[ée]n[ée]rique|markenlos|keine\s+marke)$/i.test(text(raw))) return "";
  const normalized = normalizedPart(raw);
  return normalized.length >= 2 ? normalized : "";
}

function variantPart(product) {
  const explicit = [
    product?.variant,
    product?.color,
    product?.size,
    product?.capacity,
    product?.style,
    product?.edition
  ].map(normalizedPart).filter(Boolean);
  const title = text(product?.title).toLowerCase();
  const extracted = [];
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:tb|gb|mb)\b/g,
    /\b\d+(?:\.\d+)?\s*(?:inch(?:es)?|in|cm|mm)\b/g,
    /\b(?:pack|set)\s+of\s+\d+\b/g,
    /\b\d+\s*(?:pack|pk|count|ct)\b/g,
    /\b(?:black|white|silver|gray|grey|blue|red|green|pink|gold|purple|yellow|orange|brown)\b/g,
    /\b20\d{2}\b/g
  ];
  for (const pattern of patterns) {
    for (const match of title.matchAll(pattern)) extracted.push(normalizedPart(match[0]));
  }
  return [...new Set([...explicit, ...extracted])].sort().join("-");
}

function identityForProduct(product = {}) {
  const tradeItemId = [product.gtin, product.upc, product.ean, product.product_key]
    .map(normalizeTradeItemId)
    .find(Boolean) || "";
  if (tradeItemId) {
    return { productKey:`gtin:${tradeItemId}`, tradeItemId, matchType:"gtin", variantKey:"" };
  }

  const brand = brandPart(product);
  const model = modelPart(product);
  const variantKey = variantPart(product);
  if (brand && model) {
    return {
      productKey:`bmv:${brand}:${model}${variantKey ? `:${variantKey}` : ""}`,
      tradeItemId:"",
      matchType:"brand-model-variant",
      variantKey
    };
  }

  const providerKey = validProviderKey(product.product_key);
  return {
    productKey:providerKey,
    tradeItemId:"",
    matchType:providerKey ? "provider-product" : "",
    variantKey
  };
}

function normalizeProductIdentity(product = {}) {
  const identity = identityForProduct(product);
  const rawGtin = normalizeTradeItemId(product.gtin || product.upc || product.ean || product.product_key);
  const rawUpc = normalizeTradeItemId(product.upc);
  const rawEan = normalizeTradeItemId(product.ean);
  return {
    ...product,
    product_key:identity.productKey,
    gtin:rawGtin,
    upc:rawUpc,
    ean:rawEan,
    identity_match_type:identity.matchType,
    identity_variant:identity.variantKey
  };
}

module.exports = {
  identityForProduct,
  isPlaceholder,
  normalizeProductIdentity,
  normalizeTradeItemId,
  variantPart
};
