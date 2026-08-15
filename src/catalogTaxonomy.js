const TAXONOMY_VERSION = "catalog-taxonomy-v2";

// This is the only taxonomy exposed to shoppers. Source-feed category paths are
// preserved in `category` for auditing, but must never be used as navigation.
const PUBLIC_CATEGORIES = Object.freeze([
  "Electronics",
  "Home & Kitchen",
  "Furniture",
  "Office",
  "Tools & DIY",
  "Automotive",
  "Sports & Outdoors",
  "Bikes & Mobility",
  "Health & Beauty",
  "Fashion",
  "Pet Supplies",
  "Toys & Games",
  "Baby & Kids",
  "Travel",
  "Gifts",
  "Mattresses & Sleep"
]);

const FALLBACK_CATEGORY = "Other Deals";

const EXACT = new Map([
  ["electronics", "Electronics"],
  ["smart home", "Electronics"],
  ["home", "Home & Kitchen"],
  ["home gadgets", "Home & Kitchen"],
  ["kitchen", "Home & Kitchen"],
  ["kitchen gadgets", "Home & Kitchen"],
  ["furniture", "Furniture"],
  ["office", "Office"],
  ["office gadgets", "Office"],
  ["tools", "Tools & DIY"],
  ["tools & diy", "Tools & DIY"],
  ["automotive", "Automotive"],
  ["car accessories", "Automotive"],
  ["sports & outdoors", "Sports & Outdoors"],
  ["fitness", "Sports & Outdoors"],
  ["fitness accessories", "Sports & Outdoors"],
  ["bicycles", "Bikes & Mobility"],
  ["tricycles", "Bikes & Mobility"],
  ["bikes & mobility", "Bikes & Mobility"],
  ["beauty", "Health & Beauty"],
  ["wellness", "Health & Beauty"],
  ["health & beauty", "Health & Beauty"],
  ["fashion", "Fashion"],
  ["pets", "Pet Supplies"],
  ["pet supplies", "Pet Supplies"],
  ["toys", "Toys & Games"],
  ["toys & games", "Toys & Games"],
  ["baby & kids", "Baby & Kids"],
  ["travel", "Travel"],
  ["travel accessories", "Travel"],
  ["gifts", "Gifts"],
  ["gifts under 25", "Gifts"],
  ["mattresses", "Mattresses & Sleep"],
  ["mattresses & sleep", "Mattresses & Sleep"],
  ["other deals", FALLBACK_CATEGORY],
  ["uncategorized", FALLBACK_CATEGORY],
  ["featured products", FALLBACK_CATEGORY]
]);

const RAW_RULES = [
  ["Mattresses & Sleep", /\b(mattress|mattresses|bedding|sleep|matelas|matratze)\b/i],
  ["Bikes & Mobility", /\b(bicycle|bicycles|bike|bikes|cycling|tricycle|tricycles|e-?bike|scooter|mobility|velo|fahrrad)\b/i],
  ["Office", /\b(office furniture|computer desks?|writing desks?|standing desks?|workstations?|filing cabinets?|office chairs?|bureau|schreibtisch)\b/i],
  ["Furniture", /\b(furniture|bookcases?|bookshelves?|shelving|shelves|sideboards?|nightstands?|dressers?|wardrobes?|cabinets?|console tables?|coffee tables?|dining tables?|chairs?|sofas?|meuble|mobel)\b/i],
  ["Electronics", /\b(electronics?|cell phones?|mobile phones?|smartphones?|computers?|laptops?|tablets?|audio|headphones?|cameras?|smart home|maison connectee)\b/i],
  ["Tools & DIY", /\b(tools?|hardware|home improvement|power tools?|hand tools?|drills?|screwdrivers?|wrenches?|workshop|werkzeug|outillage|bricolage)\b/i],
  ["Automotive", /\b(automotive|cars?|vehicles?|trucks?|motorcycle|auto parts?|car accessories|voiture|autozubehor)\b/i],
  ["Sports & Outdoors", /\b(sports?|outdoors?|fitness|exercise|workout|gym|yoga|camping|hiking|training)\b/i],
  ["Health & Beauty", /\b(health|beauty|personal care|skin care|skincare|hair care|wellness|cosmetics?|makeup)\b/i],
  ["Fashion", /\b(fashion|clothing|apparel|shoes?|footwear|jewelry|watches?|handbags?)\b/i],
  ["Pet Supplies", /\b(pet|pets|dog|dogs|cat|cats|puppy|kitten|animal|animaux|haustier|tierbedarf)\b/i],
  ["Toys & Games", /\b(toys?|games?|puzzles?|hobbies|collectibles?)\b/i],
  ["Baby & Kids", /\b(baby|babies|kids?|children|nursery|strollers?)\b/i],
  ["Travel", /\b(travel|luggage|passport|suitcase|weekender|voyage|reise)\b/i],
  ["Gifts", /\b(gift|gifts|personalized|custom|keepsake|souvenir|cadeau|cadeaux|geschenk)\b/i],
  ["Home & Kitchen", /\b(home|garden|household|kitchen|cookware|bakeware|cooking|utensils?|storage|decor|lighting|bath|haushalt\w*|maison|haus|kuche\w*)\b/i]
];

const TITLE_RULES = [
  // Device repair parts belong with the device, not with general tools.
  ["Electronics", /\b(iphone|ipad|android|smartphone|cell phone|mobile phone|phone battery|battery replacement|screen replacement|charger|charging|usb|headphones?|earbuds?|laptop|computer|tablet|camera|smart watch|smartwatch|bluetooth|wi-?fi)\b/i],
  ["Mattresses & Sleep", /\b(mattress|mattresses|bed pillow|sleep topper|bed frame)\b/i],
  ["Bikes & Mobility", /\b(bicycle|bike|tricycle|e-?bike|scooter|mobility)\b/i],
  ["Office", /\b(office desk|computer desk|writing desk|standing desk|workstation|filing cabinet|office chair)\b/i],
  ["Furniture", /\b(bookcase|bookshelf|shelving unit|nightstand|dresser|wardrobe|sideboard|console table|coffee table|dining table|sofa|accent chair|shoe cabinet)\b/i],
  ["Tools & DIY", /\b(power drill|impact driver|socket set|wrench set|screwdriver set|tool kit|toolbox|saw blade|workbench)\b/i],
  ["Automotive", /\b(car|vehicle|truck|automotive|motorcycle)\b/i],
  ["Sports & Outdoors", /\b(fitness|exercise|workout|gym|yoga|camping|hiking|sports?)\b/i],
  ["Health & Beauty", /\b(skincare|skin care|makeup|cosmetic|hair dryer|hair care|massager|wellness|toothbrush)\b/i],
  ["Pet Supplies", /\b(dog|cat|pet|puppy|kitten)\b/i],
  ["Toys & Games", /\b(toy|game|puzzle|playset|collectible)\b/i],
  ["Baby & Kids", /\b(baby|toddler|kids?|children|stroller|nursery)\b/i],
  ["Travel", /\b(luggage|suitcase|travel bag|passport|weekender)\b/i],
  ["Home & Kitchen", /\b(kitchen|cookware|air fryer|coffee maker|blender|storage organizer|home decor|lamp|lighting|garden|bathroom)\b/i],
  ["Fashion", /\b(dress|shirt|jacket|shoes?|sneakers?|handbag|necklace|bracelet|earrings?|watch)\b/i],
  ["Gifts", /\b(gift|personalized|custom|keepsake|souvenir)\b/i]
];

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fold(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function firstMatch(evidence, rules) {
  for (const [category, pattern] of rules) {
    if (pattern.test(evidence)) return category;
  }
  return "";
}

function canonicalCategory(product = {}) {
  const current = product.taxonomy_version === TAXONOMY_VERSION
    ? EXACT.get(fold(product.normalized_category))
    : "";
  if (current) return current;

  const raw = clean(product.category || product.normalized_category);
  const exact = EXACT.get(fold(raw));

  const source = fold(product.source);
  if (source.includes("giftlab")) return "Gifts";
  if (source.includes("king-koil")) return "Mattresses & Sleep";
  if (source.includes("mooncool")) return "Bikes & Mobility";

  const titleMatch = firstMatch(fold(product.title), TITLE_RULES);
  if (exact === "Tools & DIY" && titleMatch === "Electronics") return titleMatch;
  if (exact) return exact;

  const rawMatch = firstMatch(fold(raw), RAW_RULES);
  if (rawMatch === "Home & Kitchen" && ["Office", "Furniture", "Tools & DIY"].includes(titleMatch)) {
    return titleMatch;
  }
  if (rawMatch) return rawMatch;
  if (titleMatch) return titleMatch;

  // Tribesigns is a furniture merchant. Specific office and home rules above
  // still win, while an opaque feed path safely falls back to Furniture.
  if (source.includes("tribesigns")) return "Furniture";
  return FALLBACK_CATEGORY;
}

function isPublicCategory(category) {
  return PUBLIC_CATEGORIES.includes(String(category || ""));
}

function normalizeCatalogProduct(product = {}) {
  return {
    ...product,
    normalized_category: canonicalCategory(product),
    taxonomy_version: TAXONOMY_VERSION
  };
}

module.exports = {
  TAXONOMY_VERSION,
  PUBLIC_CATEGORIES,
  FALLBACK_CATEGORY,
  canonicalCategory,
  isPublicCategory,
  normalizeCatalogProduct
};
