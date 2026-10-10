// Only the scheduled AliExpress sweep uses these shelves. Shopper searches
// keep their own keywords, and other retailers keep their existing budgets.
const SHELVES = Object.freeze({
  "Baby & Kids": ["baby clothes", "baby clothing", "baby storage organizer"],
  "Bikes & Mobility": ["bicycle bag", "bicycle bottle holder", "bicycle bell"],
  "Fashion": ["handbag", "fashion belt", "fashion scarf"],
  "Automotive": ["car organizer", "car sun shade", "car cleaning brush"],
  "Furniture": ["side table", "nightstand", "storage cabinet"],
  "Pet Supplies": ["pet grooming brush", "dog leash", "cat scratching mat"],
  "Travel": ["travel packing cubes", "passport holder", "luggage organizer"],
  "Mattresses & Sleep": ["bedding pillowcase", "bedding sheet", "mattress protector"],
  "Toys & Games": ["jigsaw puzzle", "board game", "building blocks toy"],
  "Tools & DIY": ["screwdriver set", "socket wrench", "tool organizer"],
  "Health & Beauty": ["makeup brush", "cosmetic bag", "hair brush"],
  "Sports & Outdoors": ["resistance bands", "camping bag", "yoga mat"],
  "Home & Kitchen": ["kitchen storage organizer", "silicone kitchen utensils", "bathroom organizer"],
  "Arts & Crafts": ["paint brushes", "sewing kit", "drawing pencils"],
  "Office": ["desk organizer", "office stationery", "pencil case"],
  "Gifts": ["personalized keychain", "gift box", "personalized mug"],
  "Electronics": ["wireless mouse", "usb hub", "phone stand"]
});

function planGapSearches(rows = [], { target = 100, limit = 6, now = Date.now() } = {}) {
  const counts = new Map(rows.map(row => [row.category, Number(row.count) || 0]));
  const slot = Math.floor(now / (3 * 3600 * 1000));
  return Object.entries(SHELVES)
    .map(([category, keywords]) => ({ category, count: counts.get(category) || 0, keywords }))
    .filter(shelf => shelf.count < target)
    .sort((a, b) => a.count - b.count || a.category.localeCompare(b.category))
    .slice(0, limit)
    .map(shelf => ({
      category: shelf.category,
      keyword: shelf.keywords[slot % shelf.keywords.length],
      count: shelf.count,
      missing: target - shelf.count
    }));
}

module.exports = { planGapSearches, SHELVES };
