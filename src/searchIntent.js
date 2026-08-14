function clean(value, limit = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function fold(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function amount(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (!raw) return null;
  const normalized = /[.,]\d{1,2}$/.test(raw) && !/[.,]\d{3}$/.test(raw)
    ? raw.replace(/\.(?=.*\.)/g, "").replace(/,(?=\d{1,2}$)/, ".")
    : raw.replace(/[.,]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function replaceSpan(text, start, length) {
  return `${text.slice(0, start)} ${text.slice(start + length)}`;
}

function priceConstraint(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = amount(match[1]);
    if (value == null) continue;
    return {value, start:match.index, length:match[0].length};
  }
  return null;
}

const RANGE_PATTERNS = [
  /\b(?:between|from)\s*[$€£]?\s*(\d[\d\s.,]*)\s*(?:and|to|-)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:entre|de)\s*[$€£]?\s*(\d[\d\s.,]*)\s*(?:y|a|-)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:entre|de)\s*[$€£]?\s*(\d[\d\s.,]*)\s*(?:et|a|-)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:zwischen|von)\s*[$€£]?\s*(\d[\d\s.,]*)\s*(?:und|bis|-)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /(?:от|между)\s*[$€£]?\s*(\d[\d\s.,]*)\s*(?:до|и|-)\s*[$€£]?\s*(\d[\d\s.,]*)/iu,
];

const MAX_PATTERNS = [
  /\b(?:under|below|less than|up to|at most|max(?:imum)?|budget(?: of)?|no more than)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:menos de|hasta|maximo|presupuesto(?: de)?|no mas de)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:moins de|jusqu(?:'|’)a|maximum|budget(?: de)?|pas plus de)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:unter|bis|maximal|hochstens|budget(?: von)?)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /(?:до|не дороже|максимум|бюджет(?: до)?)\s*[$€£]?\s*(\d[\d\s.,]*)/iu,
  /(?:qeder|maksimum|budce)\s*[$€£]?\s*(\d[\d\s.,]*)/i,
];

const MIN_PATTERNS = [
  /\b(?:over|above|more than|at least|min(?:imum)?)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:mas de|al menos|minimo)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:plus de|au moins|minimum)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /\b(?:uber|mehr als|mindestens|minimum)\s*[$€£]?\s*(\d[\d\s.,]*)\b/i,
  /(?:от|не дешевле|минимум)\s*[$€£]?\s*(\d[\d\s.,]*)/iu,
];

function knownValue(text, values) {
  const foldedText = ` ${fold(text)} `;
  const candidates = [...new Set((values || []).map(value => clean(value)).filter(Boolean))]
    .map(value => ({value, folded:fold(value)}))
    .filter(item => item.folded.length >= 2)
    .sort((left, right) => right.folded.length - left.folded.length);
  for (const candidate of candidates) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(candidate.folded).replace(/\\ /g, "\\s+")}([^a-z0-9]|$)`, "i");
    const match = pattern.exec(foldedText);
    if (match) return candidate.value;
  }
  return "";
}

function categoryValue(text, categories) {
  const foldedText = ` ${fold(text)} `;
  const candidates = [];
  for (const category of [...new Set((categories || []).map(value => clean(value)).filter(Boolean))]) {
    const segments = [category, ...category.split(/\s*(?:>|\/|·)\s*/)]
      .map(fold)
      .filter(value => value.length >= 3);
    for (const term of segments) {
      candidates.push({value:category, term});
      if (term.endsWith("s") && term.length > 4) candidates.push({value:category, term:term.slice(0, -1)});
    }
  }
  candidates.sort((left, right) => right.term.length - left.term.length);
  for (const candidate of candidates) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(candidate.term).replace(/\\ /g, "\\s+")}([^a-z0-9]|$)`, "i");
    if (pattern.test(foldedText)) return candidate.value;
  }
  return "";
}

function removePhrase(text, phrase) {
  if (!phrase) return text;
  const words = fold(phrase).split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!words.length) return text;
  return text.replace(new RegExp(`(^|[^a-z0-9])${words.join("\\s+")}([^a-z0-9]|$)`, "i"), " ");
}

function parseSearchIntent(value, context = {}) {
  const originalQuery = clean(value);
  let working = fold(originalQuery);
  let minimumPrice = null;
  let maximumPrice = null;

  for (const pattern of RANGE_PATTERNS) {
    const match = pattern.exec(working);
    if (!match) continue;
    const left = amount(match[1]);
    const right = amount(match[2]);
    if (left != null && right != null) {
      minimumPrice = Math.min(left, right);
      maximumPrice = Math.max(left, right);
      working = replaceSpan(working, match.index, match[0].length);
      break;
    }
  }

  if (maximumPrice == null) {
    const maximum = priceConstraint(working, MAX_PATTERNS);
    if (maximum) {
      maximumPrice = maximum.value;
      working = replaceSpan(working, maximum.start, maximum.length);
    }
  }
  if (minimumPrice == null) {
    const minimum = priceConstraint(working, MIN_PATTERNS);
    if (minimum) {
      minimumPrice = minimum.value;
      working = replaceSpan(working, minimum.start, minimum.length);
    }
  }

  const merchant = knownValue(working, context.merchants);
  working = removePhrase(working, merchant);
  const category = categoryValue(working, context.categories);
  working = removePhrase(working, category);
  const query = clean(working.replace(/\b(?:from|at|in|store|shop|tienda|boutique|magasin|laden|магазин)\b/gi, " "));
  const inferred = [];
  if (category) inferred.push("category");
  if (merchant) inferred.push("merchant");
  if (minimumPrice != null) inferred.push("min_price");
  if (maximumPrice != null) inferred.push("max_price");

  return {
    originalQuery,
    query,
    category,
    merchant,
    minimumPrice,
    maximumPrice,
    inferred,
  };
}

function applySearchIntent(query = {}, rows = []) {
  const categories = [...new Set((rows || []).map(product => clean(product.normalized_category || product.category)).filter(Boolean))];
  const merchants = [...new Set((rows || []).map(product => clean(product.retailer_name || product.source)).filter(Boolean))];
  const parsed = parseSearchIntent(query.q ?? query.query, {categories, merchants});
  const appliedQuery = {...query};
  const intent = {
    ...parsed,
    category:"",
    merchant:"",
    minimumPrice:null,
    maximumPrice:null,
    inferred:[],
  };
  if (parsed.originalQuery) appliedQuery.q = parsed.query;
  if (!clean(query.category ?? query.categories) && parsed.category) {
    appliedQuery.category = parsed.category;
    intent.category = parsed.category;
    intent.inferred.push("category");
  }
  if (!clean(query.merchant ?? query.store ?? query.merchants) && parsed.merchant) {
    appliedQuery.merchant = parsed.merchant;
    intent.merchant = parsed.merchant;
    intent.inferred.push("merchant");
  }
  if ((query.min_price == null || query.min_price === "") && parsed.minimumPrice != null) {
    appliedQuery.min_price = parsed.minimumPrice;
    intent.minimumPrice = parsed.minimumPrice;
    intent.inferred.push("min_price");
  }
  if ((query.max_price == null || query.max_price === "") && parsed.maximumPrice != null) {
    appliedQuery.max_price = parsed.maximumPrice;
    intent.maximumPrice = parsed.maximumPrice;
    intent.inferred.push("max_price");
  }
  return {query:appliedQuery, intent};
}

module.exports = { applySearchIntent, parseSearchIntent };
