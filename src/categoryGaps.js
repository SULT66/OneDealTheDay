/* Categories below 50 receive a bounded discovery batch: up to 20 new
 * AliExpress listings and 50 new eBay listings with a real public Score.
 * API budgets remain bounded; a shortfall is reported, never filled with
 * duplicate listings or invented scores. */

const { HOURS } = require("./catalogSchedule");
const ROTATION_PERIOD_MS = HOURS * 3600 * 1000;

const SHELVES = Object.freeze({
  /* The eight below fifty, with the most room to fill. */
  "Travel": [
    "packing cubes", "luggage tag", "travel pillow", "passport wallet",
    "toiletry bag", "luggage scale", "travel adapter", "carry on backpack",
    "compression packing bag", "luggage strap",
  ],
  "Automotive": [
    "car phone mount", "dash cam", "tire inflator", "jump starter",
    "car seat covers", "car floor mats", "obd2 scanner", "car vacuum",
    "windshield sun shade", "car trash can",
  ],
  "Mattresses & Sleep": [
    "mattress protector", "memory foam pillow", "weighted blanket",
    "mattress topper", "bed sheets set", "cooling pillow", "duvet insert",
    "pillow protector", "bed pillows", "sleep mask",
  ],
  "Baby & Kids": [
    "baby monitor", "diaper bag", "baby carrier", "baby bottle",
    "toddler plates", "stroller organizer", "baby swaddle", "kids water bottle",
    "baby bath toys", "kids night light",
  ],
  "Furniture": [
    "nightstand", "bookshelf", "shoe rack", "coffee table", "storage ottoman",
    "console table", "tv stand", "folding table", "bar stools", "accent chair",
  ],
  "Tools & DIY": [
    "socket set", "cordless drill", "tool bag", "multimeter", "stud finder",
    "tape measure", "screwdriver set", "wrench set", "utility knife", "laser level",
  ],
  "Toys & Games": [
    "board game", "lego set", "jigsaw puzzle 1000", "rc car", "card game",
    "building blocks", "action figure", "plush toy", "dice set", "chess set",
  ],
  "Pet Supplies": [
    "dog leash", "cat tree", "dog bed", "pet grooming brush", "cat litter box",
    "pet water fountain", "dog harness", "cat toys", "pet carrier",
    "slow feeder dog bowl",
  ],

  /* The rest, which are not thin but stay in the map so the plan can reach
     them if they ever fall behind. */
  "Fashion": ["handbag", "leather belt", "winter scarf", "sunglasses", "wallet"],
  "Bikes & Mobility": ["bike lights", "bicycle pump", "bike lock", "cycling gloves", "bike phone mount"],
  "Health & Beauty": ["makeup brush set", "hair dryer", "electric toothbrush", "skincare set", "nail kit"],
  "Sports & Outdoors": ["resistance bands", "yoga mat", "camping lantern", "water bottle", "dumbbell set"],
  "Arts & Crafts": ["acrylic paint set", "sketchbook", "sewing kit", "colored pencils", "craft storage"],
  "Home & Kitchen": ["kitchen knife set", "food storage containers", "air fryer", "cutting board", "coffee grinder"],
  "Office": ["desk organizer", "monitor stand", "office chair mat", "whiteboard", "label maker"],
  "Gifts": ["gift basket", "personalized mug", "photo frame", "candle set", "jewelry box"],
  "Electronics": ["wireless mouse", "usb c hub", "bluetooth speaker", "webcam", "power bank"],
});

/**
 * The categories furthest below target, with a keyword each.
 *
 * `now` picks which keyword from the shelf, so consecutive runs search
 * different phrases and the catalogue does not fill with ten versions of the
 * same product.
 */
function planGapSearches(rows = [], { target = 50, limit = 17, now = Date.now() } = {}) {
  const counts = new Map(rows.map(row => [row.category, Number(row.count) || 0]));
  const slot = Math.floor(now / ROTATION_PERIOD_MS);
  return Object.entries(SHELVES)
    .map(([category, keywords]) => ({ category, count: counts.get(category) || 0, keywords }))
    .filter(shelf => shelf.count < target)
    .sort((a, b) => a.count - b.count || a.category.localeCompare(b.category))
    .slice(0, limit)
    .map(shelf => ({
      category: shelf.category,
      keyword: shelf.keywords[slot % shelf.keywords.length],
      count: shelf.count,
      missing: target - shelf.count,
    }));
}

/**
 * The same plan as a flat list of search terms, for a provider that takes one.
 *
 * eBay's importer is handed `searchKeywords` and nothing else, so a category
 * plan reaches it only as extra phrases in that list. `perCategory` phrases
 * each, offset by the same clock slot, so a run covers several angles on a
 * thin category instead of one.
 */
function gapKeywords(rows = [], { target = 50, limit = 17, perCategory = 3, now = Date.now() } = {}) {
  const slot = Math.floor(now / ROTATION_PERIOD_MS);
  const terms = [];
  for (const shelf of planGapSearches(rows, { target, limit, now })) {
    const keywords = SHELVES[shelf.category] || [];
    for (let i = 0; i < Math.min(perCategory, keywords.length); i += 1) {
      terms.push(keywords[(slot + i) % keywords.length]);
    }
  }
  return [...new Set(terms)];
}

module.exports = { SHELVES, gapKeywords, planGapSearches };
