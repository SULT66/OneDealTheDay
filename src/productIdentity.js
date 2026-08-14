const PLACEHOLDER_PATTERN = /^(?:n\s*a|na|none|null|unknown|not\s+(?:applicable|specified)|does\s+not\s+apply|non\s+applicable|nicht\s+(?:zutreffend|anwendbar)|keine\s+angabe|sans\s+objet|ne\s+s\s+applique\s+pas|no\s+aplica|不适用)$/i;
const TRADE_ITEM_LENGTHS = new Set([8, 12, 13, 14]);
const GROUP_QUERY_PARAMETERS = new Set(["variant", "variant_id"]);
const TRACKING_QUERY_PARAMETERS = /^(?:awc|awinaffid|clickref|clickref\d*|gclid|fbclid|msclkid|ref|source|utm_.+)$/i;

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

function hasValidTradeItemChecksum(value) {
  const digits = String(value || "").split("").map(Number);
  if (!TRADE_ITEM_LENGTHS.has(digits.length) || digits.some(digit => !Number.isInteger(digit))) return false;
  const checkDigit = digits.pop();
  let sum = 0;
  let weight = 3;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function normalizeTradeItemId(value) {
  let candidate = text(value).replace(/^(?:gtin|upc|ean)\s*:/i, "").trim();
  if (isPlaceholder(candidate)) return "";
  candidate = candidate.replace(/[^0-9]/g, "");
  if (!TRADE_ITEM_LENGTHS.has(candidate.length) || /^0+$/.test(candidate) || !hasValidTradeItemChecksum(candidate)) return "";
  return candidate.padStart(14, "0");
}

function canonicalMerchantProductUrl(value) {
  try {
    const url = new URL(text(value));
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const retained = [...url.searchParams.entries()]
      .filter(([key]) => !GROUP_QUERY_PARAMETERS.has(key.toLowerCase()) && !TRACKING_QUERY_PARAMETERS.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    url.search = "";
    for (const [key, entryValue] of retained) url.searchParams.append(key, entryValue);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return "";
  }
}

function sourceScope(product = {}) {
  const source = normalizedPart(product.source_catalog_id || product.source || product.provider || "source");
  const market = normalizedPart(product.market || "global");
  const merchant = normalizedPart(product.merchant_id || product.retailer_name || product.seller_name || "merchant");
  return `${source || "source"}:${market || "global"}:${merchant || "merchant"}`;
}

function sourceGroupKey(product = {}) {
  const scope = sourceScope(product);
  const existing = text(product.source_group_key);
  if (existing) return existing.startsWith(`${scope}:`) ? existing : `${scope}:key:${normalizedPart(existing)}`;
  const explicit = [
    product.source_group_id,
    product.item_group_id,
    product.parent_product_id,
    product.source_parent_id,
    product.group_id
  ].find(value => !isPlaceholder(value));
  const canonicalUrl = canonicalMerchantProductUrl(
    product.canonical_product_url || product.product_url
  );
  const group = explicit ? `id:${normalizedPart(explicit)}` : canonicalUrl ? `url:${canonicalUrl}` : "";
  return group ? `${scope}:${group}` : "";
}

function sourceVariantKey(product = {}) {
  if (text(product.source_variant_key)) return text(product.source_variant_key);
  const explicit = [product.source_variant_id, product.variant_id].find(value => !isPlaceholder(value));
  if (explicit) return normalizedPart(explicit);
  try {
    const url = new URL(text(product.product_url));
    for (const key of GROUP_QUERY_PARAMETERS) {
      const value = url.searchParams.get(key);
      if (!isPlaceholder(value)) return normalizedPart(value);
    }
  } catch {}
  const fallback = product.provider_external_id || product.external_id;
  return isPlaceholder(fallback) ? "" : normalizedPart(fallback);
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
    product?.edition,
    product?.material,
    product?.firmness,
    product?.pack_count
  ].map(normalizedPart).filter(Boolean);
  const title = text(product?.title).toLowerCase();
  const extracted = [];
  const patterns = [
    /\b\d+(?:\.\d+)?\s*(?:tb|gb|mb)\b/g,
    /\b\d+(?:\.\d+)?\s*(?:inch(?:es)?|in|cm|mm)\b/g,
    /\b(?:pack|set)\s+of\s+\d+\b/g,
    /\b\d+\s*(?:pack|pk|count|ct)\b/g,
    /\b(?:black|white|silver|gray|grey|blue|red|green|pink|gold|purple|yellow|orange|brown)\b/g,
    /\b(?:twin xl|twin|full|double|queen|king|california king|cal king)\b/g,
    /\b(?:soft|medium(?: firm)?|firm|extra firm)\b/g,
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
  const canonicalProductUrl = canonicalMerchantProductUrl(
    product.canonical_product_url || product.product_url
  );
  return {
    ...product,
    product_key:identity.productKey,
    gtin:rawGtin,
    upc:rawUpc,
    ean:rawEan,
    identity_match_type:identity.matchType,
    identity_variant:identity.variantKey,
    canonical_product_url:canonicalProductUrl,
    source_group_key:sourceGroupKey({...product, canonical_product_url:canonicalProductUrl}),
    source_variant_key:sourceVariantKey(product)
  };
}

module.exports = {
  brandPart,
  canonicalMerchantProductUrl,
  hasValidTradeItemChecksum,
  identityForProduct,
  isPlaceholder,
  normalizeProductIdentity,
  normalizeTradeItemId,
  sourceGroupKey,
  sourceVariantKey,
  variantPart
};
