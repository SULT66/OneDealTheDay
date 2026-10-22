const { searchTokens, normalizedTitle, looksLikeAccessory, isMainProductQuery } = require("./ranker");

// Departments are too broad: a hub and a tyre inflator can both be Electronics.
// Match the first named product type, before compatibility targets later in a title.
const TYPES = [
  ["usb hub", /\b(?:usb(?:c|[234])? (?:c )?hubs?|docking stations?)\b/],
  ["headphones", /\b(?:headphones?|headsets?|earbuds?|earphones?)\b/],
  ["laptop", /\b(?:laptops?|notebooks?|macbooks?)\b/],
  ["monitor", /\b(?:computer monitors?|gaming monitors?|monitors?)\b/],
  ["keyboard", /\bkeyboards?\b/],
  ["mouse", /\b(?:computer mice|wireless mice|gaming mice|mouse)\b/],
  ["speaker", /\b(?:speakers?|soundbars?)\b/],
  ["router", /\b(?:network routers?|wifi routers?|wi fi routers?|wireless routers?)\b/],
  ["ssd", /\b(?:ssds?|solid state drives?)\b/],
  ["hard drive", /\bhard drives?\b/],
  ["television", /\b(?:televisions?|tvs?)\b/],
  ["phone", /\b(?:smartphones?|iphones?|cell phones?)\b/],
  ["camera", /\bcameras?\b/],
  ["printer", /\bprinters?\b/],
  ["office chair", /\b(?:office|desk|task|executive) chairs?\b/],
  ["camping chair", /\b(?:camping|hunting|folding) chairs?\b/],
  ["dining chair", /\bdining chairs?\b/],
  ["chair", /\bchairs?\b/],
  ["desk", /\bdesks?\b/],
  ["bookshelf", /\b(?:bookshel(?:f|ves)|bookcases?)\b/],
  ["sofa", /\b(?:sofas?|couches|couch)\b/],
  ["mattress", /\bmattress(?:es)?\b/],
  ["pillow", /\bpillows?\b/],
  ["coffee table", /\bcoffee tables?\b/],
  ["dining table", /\bdining tables?\b/],
  ["table", /\btables?\b/],
  ["vacuum", /\b(?:vacuum cleaners?|robot vacuums?|vacuums?)\b/],
  ["coffee maker", /\b(?:coffee (?:makers?|machines?|brewers?)|coffeemakers?|espresso machines?)\b/],
  ["kettle", /\bkettles?\b/],
  ["air fryer", /\bair fryers?\b/],
  ["blender", /\bblenders?\b/],
  ["pan", /\b(?:frying pans?|skillets?)\b/],
  ["drill", /\b(?:drills?|drill drivers?)\b/],
  ["tool bag", /\b(?:tool (?:storage )?bags?|tool totes?|toolboxes?|tool boxes?)\b/],
  ["paintbrush", /\b(?:paintbrush(?:es)?|paint brushes?|watercolor (?:artist )?brush(?:es)?|artist brushes?)\b/],
  ["heater", /\b(?:space heaters?|heaters?)\b/],
  ["dehumidifier", /\bdehumidifiers?\b/],
  ["humidifier", /\bhumidifiers?\b/],
  ["air purifier", /\bair purifiers?\b/],
  ["jacket", /\bjackets?\b/],
  ["shoes", /\b(?:shoes|sneakers?|trainers?)\b/],
  ["backpack", /\bbackpacks?\b/],
  ["watch", /\b(?:watches|watch|smartwatches|smartwatch)\b/],
  ["pet feeder", /\b(?:dog|cat|pet) feeders?\b/],
  ["pet bed", /\b(?:dog|cat|pet) beds?\b/],
  ["string lights", /\b(?:string lights?|fairy lights?)\b/],
  ["costume", /\bcostumes?\b/],
];
const NOISE = new Set("new set kit size short long handle inch piece pack black white red blue limited usb wireless bluetooth portable rechargeable gaming smart premium professional large small with compatible universal outdoor indoor halloween decor decoration decorations led".split(" "));
const GENERIC_BRANDS = /^(?:generic|unbranded|unknown|n a|none)$/;

function productType(product) {
  const title = normalizedTitle(product?.title);
  const matches = TYPES.map(([type, pattern]) => ({type, match:pattern.exec(title)}))
    .filter(row => row.match).sort((a, b) => a.match.index - b.match.index);
  const first = matches[0];
  if (!first) return "";
  // A case for a laptop or a laptop cooling pad is not another laptop.
  if (isMainProductQuery(first.type) && looksLikeAccessory(product, first.type)) return "";
  const prefix = title.slice(0, first.match.index);
  if (/\b(?:for|compatible with|fits|replacement for)\b/.test(prefix)) return "";
  return first.type;
}

function meaningfulTerms(product) {
  const brand = new Set(searchTokens(product?.brand));
  return [...new Set(searchTokens(product?.title))].filter(word =>
    word.length > 2 && !NOISE.has(word) && !brand.has(word) && !/\d/.test(word));
}

function relatedProducts(product, candidates, limit = 12) {
  const type = productType(product);
  const terms = meaningfulTerms(product);
  const brand = normalizedTitle(product?.brand);
  const seen = new Set([String(product?.id)]);
  const category = product?.normalized_category || product?.category;
  const scored = (candidates || []).filter(p => {
    const id = String(p.id);
    if (seen.has(id)) return false;
    seen.add(id);
    if (p.market && product.market && p.market !== product.market) return false;
    if (p.currency && product.currency && p.currency !== product.currency) return false;
    if (p.status && p.status !== "published") return false;
    if (/\b(?:out of stock|sold out|expired|ended|unavailable)\b/i.test(String(p.availability || "").replace(/_/g, " "))) return false;
    const candidateCategory = p.normalized_category || p.category;
    return !category || !candidateCategory || category === candidateCategory;
  }).map(p => {
    const candidateType = productType(p);
    if (type && candidateType !== type) return null;
    const words = new Set(meaningfulTerms(p));
    const shared = terms.filter(word => words.has(word)).length;
    // Unknown types need substantial overlap; a brand or generic adjective
    // cannot on its own manufacture a recommendation.
    if (!type && (shared < 2 || shared / Math.max(terms.length, words.size, 1) < 0.5)) return null;
    const sameBrand = brand && !GENERIC_BRANDS.test(brand) && brand === normalizedTitle(p.brand);
    const score = shared / Math.max(terms.length, words.size, 1) * 100 + (sameBrand ? 5 : 0);
    return {product:p, score};
  }).filter(Boolean).sort((a,b) => b.score - a.score ||
    Number(b.product.ranking_score || b.product.score || 0) - Number(a.product.ranking_score || a.product.score || 0) ||
    Number(a.product.current_price || Infinity) - Number(b.product.current_price || Infinity) ||
    String(a.product.id).localeCompare(String(b.product.id)));
  return scored.slice(0, Math.max(0, limit)).map(row => row.product);
}
module.exports = { relatedProducts };
