const { searchTokens, normalizedTitle } = require("./ranker");

// Departments are too broad: a hub and a tyre inflator can both be Electronics.
// Match the first named product type, before compatibility targets later in a title.
const TYPES = [
  ["knife sharpener", /\b(?:knife sharpeners?|sharpening (?:stones?|systems?)|whetstones?|wetstones?)\b/],
  ["kitchen knife", /\b(?:(?:kitchen|chef|boning|butcher|fruit) (?:knife|knives)|knife sets?|kitchen knives)\b/],
  ["food containers", /\b(?:food storage containers?|food containers?|meal prep containers?)\b/],
  ["cutlery", /\b(?:tableware|dinnerware|flatware|cutlery)(?: sets?)?\b/],
  ["printer paper", /\b(?:(?:printer|copy|printing|multipurpose|print) (?:and print |and copy )?paper|copy and print\w* (?:printer )?paper)\b/],
  ["ink cartridge", /\b(?:ink (?:cartridges?|tanks?)|toner (?:cartridges?)?)\b/],
  ["baby monitor", /\b(?:video )?baby monitors?\b/],
  ["power bank", /\b(?:power ?banks?|portable (?:external )?batter(?:y|ies)|external battery (?:backups?|chargers?))\b/],
  ["tire inflator", /\b(?:inflators?|tire inflators?|tyre inflators?|tire pumps?|tyre pumps?|air compressors?)\b/],
  ["phone holder", /\b(?:car )?(?:phone|cell phone) (?:holders?|mounts?|stands?)\b/],
  ["dash camera", /\b(?:dash ?cams?|dash cameras?|car dvr)\b/],
  ["thermostat", /\bthermostats?\b/],
  ["tape measure", /\b(?:tape measures?|measuring tapes?)\b/],
  ["screwdriver bits", /\b(?:screwdriver|drill|driver) bits?\b/],
  ["screwdriver", /\bscrewdrivers?\b/],
  ["ladder", /\b(?:step ?ladders?|ladders?)\b/],
  ["shredder", /\b(?:paper )?shredders?\b/],
  ["label maker", /\b(?:label makers?|label printers?)\b/],
  ["cutting board", /\b(?:cutting|chopping) boards?\b/],
  ["cookware", /\b(?:cookware|pots? and pans?)(?: sets?)?\b/],
  ["mixer", /\b(?:(?:stand|hand) mixers?|mixers?)\b/],
  ["toothbrush", /\b(?:electric |sonic )?toothbrush(?:es)?\b/],
  ["sunglasses", /\bsunglasses\b/],
  ["storage cabinet", /\b(?:storage cabinets?|cabinets?)\b/],
  ["shelving", /\b(?:shelving units?|storage shel(?:f|ves)|garage racks?)\b/],
  ["building set", /\b(?:lego|building (?:sets?|blocks?|toys?)|construction (?:sets?|blocks?))\b/],
  ["board game", /\b(?:board games?|game boards?)\b/],
  ["halloween mask", /\b(?:(?:halloween|latex|horror|cosplay|michael myers) (?:face )?masks?|masks?)\b/],
  ["animatronic", /\b(?:animatronics?|animated [\w ]{0,65}(?:props?|witch|skeleton|ghost|prisoner))\b/],
  ["inflatable decoration", /\b(?:inflatables?|blow ups?|blow up)\b/],
  ["decorative statue", /\b(?:statues?|figurines?|statuettes?|sculptures?)\b/],
  ["kettlebell", /\bkettlebells?\b/],
  ["dumbbell", /\bdumbbells?\b/],
  ["resistance bands", /\bresistance bands?\b/],
  ["bottle warmer", /\b(?:baby )?bottle warmers?\b/],
  ["pet fountain", /\b(?:(?:pet|cat|dog) )?(?:water|drinking) fountains?\b/],
  ["diaper bag", /\b(?:diaper bags?|back ?pack diaper bags?)\b/],
  ["necklace", /\bnecklaces?\b/],
  ["bracelet", /\bbracelets?\b/],
  ["ring", /\brings?\b/],
  ["earrings", /\bearrings?\b/],
  ["mug", /\b(?:mugs?|coffee cups?)\b/],
  ["tumbler", /\btumblers?\b/],
  ["blanket", /\b(?:blankets?|throws?)\b/],
  ["wallet", /\bwallets?\b/],
  ["handbag", /\b(?:handbags?|shoulder bags?|crossbody bags?|tote bags?)\b/],
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
  ["office chair", /\b(?:office|desk|task|executive)(?: \w+){0,4} chairs?\b/],
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
    .filter(row => row.match && (row.type !== "halloween mask" || /halloween/i.test(product?.normalized_category || product?.public_category || product?.category || "") || /\b(?:halloween|horror|latex|cosplay|michael myers)\b/.test(title)) && (row.type !== "ring" || normalizedTitle(product?.brand) !== "ring")).sort((a, b) => a.match.index - b.match.index);
  const first = matches.find(row => row.type === "cookware") || matches[0];
  if (!first) return "";
  // Check the product noun in context, rather than rejecting a whole drill
  // kit for containing "batteries" or earbuds for naming compatible phones.
  const prefix = title.slice(0, first.match.index).replace(/\bfor pro\b/g, "");
  if (/\b(?:for|compatible with|fits|replacement for)\b/.test(prefix)) return "";
  const suffix = title.slice(first.match.index + first.match[0].length);
  if (["laptop","headphones","monitor","keyboard","mouse","speaker","router","ssd","hard drive","television","phone","camera","printer","chair","office chair","camping chair","mattress","pillow","vacuum","drill","blender","toothbrush","air purifier"].includes(first.type) && /^\s+(?:(?:replacement|protective|silicone|carrying|cooling|charging)\s+){0,3}(?:cases?|covers?|pads?|protectors?|batter(?:y|ies)|straps?|stands?|mounts?|sleeves?|filters?|brush heads?)\b/.test(suffix)) return "";
  return /\b(?:miniature|dollhouse)\b/.test(title) ? `miniature ${first.type}` : first.type;
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
  const category = product?.normalized_category || product?.public_category || product?.category;
  const scored = (candidates || []).filter(p => {
    const id = String(p.id);
    if (seen.has(id)) return false;
    seen.add(id);
    if (p.market && product.market && p.market !== product.market) return false;
    if (p.currency && product.currency && p.currency !== product.currency) return false;
    if (p.status && p.status !== "published") return false;
    if (/\b(?:out of stock|sold out|expired|ended|unavailable)\b/i.test(String(p.availability || "").replace(/_/g, " "))) return false;
    const candidateCategory = p.normalized_category || p.public_category || p.category;
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
