/* v4: a department label a source sends can simply be wrong, and now loses to
   an unambiguous product word in the title. The version is what makes the
   catalogue re-file itself — app.js recalculates every product whose stamp does
   not match on boot — so bumping it is how the corrected rules reach the
   listings already stored. */
const TAXONOMY_VERSION = "catalog-taxonomy-v4";

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

/*
 * What a title has to say for us to file it somewhere.
 *
 * These were written tight, around the shops that were connected at the time,
 * and a partner review is what exposed the cost: Electronics held 19 listings
 * and Home & Kitchen 7, while a cordless drill, an SSD, a wireless mouse, a
 * mixing bowl, a printer and a paper shredder all landed in Other Deals. The
 * rule for tools asked for the exact phrase "power drill", so "DEWALT 20V MAX
 * Cordless Drill Driver Kit" was not a tool.
 *
 * The additions below are the ordinary words those products are sold under.
 * Order still decides ties, first match winning, so anything ambiguous is
 * written narrowly rather than added as a bare word: "mouse" alone would file
 * a cat toy under Electronics, and "monitor" alone would do the same to a baby
 * monitor.
 */
const TITLE_RULES = [
  // Device repair parts belong with the device, not with general tools.
  /* Plurals count. "Gaming Headsets Xbox" was not a headset to this rule,
     because \b after "headset" refuses the trailing s, so a Newegg listing
     stayed filed under vehicle parts. */
  ["Electronics", /\b(iphones?|ipads?|android|smartphones?|cell phones?|mobile phones?|phone batter(?:y|ies)|battery replacement|screen replacement|chargers?|charging|usb|headphones?|earbuds?|laptops?|computers?|tablets?|cameras?|smart watch(?:es)?|smartwatch(?:es)?|televisions?|tvs?|oled|qled|projectors?|bluetooth|wi-?fi|ssds?|nvme|hard drives?|external drives?|flash drives?|memory cards?|micro ?sd|power banks?|hdmi|webcams?|routers?|soundbars?|graphics cards?|motherboards?|processors?|gaming mouse|wireless mouse|computer mouse|mechanical keyboards?|wireless keyboards?|gaming monitors?|computer monitors?|portable speakers?|bluetooth speakers?|headsets?|smart thermostats?|smart plugs?|smart bulbs?|security cameras?|video doorbells?|streaming sticks?|3d printers?)\b/i],
  ["Mattresses & Sleep", /\b(mattress|mattresses|bed pillow|sleep topper|bed frame)\b/i],
  ["Bikes & Mobility", /\b(bicycle|bike|tricycle|e-?bike|scooter|mobility)\b/i],
  ["Office", /\b(office desk|computer desk|writing desk|standing desk|workstation|filing cabinet|office chair|printer|ink cartridge|toner|paper shredder|laminator|stapler|whiteboard|label maker|desk organizer|desk lamp|monitor stand|copy paper|file folders?)\b/i],
  ["Furniture", /\b(bookcase|bookshelf|shelving unit|nightstand|dresser|wardrobe|sideboard|console table|coffee table|dining table|sofa|accent chair|shoe cabinet)\b/i],
  ["Tools & DIY", /\b(drill|impact driver|socket set|wrench|screwdriver|tool kit|tool set|toolbox|tool bag|saw blade|circular saw|miter saw|jigsaw|hacksaw|reciprocating saw|workbench|pliers|hammer|tape measure|stud finder|multimeter|utility knife|drill bit|hex key|sander|angle grinder|step ladder|work light|power tool|socket wrench|caulk gun|paint roller)\b/i],
  ["Automotive", /\b(car|vehicle|truck|automotive|motorcycle|dash ?cam|jump starter)\b/i],
  ["Sports & Outdoors", /\b(fitness|exercise|workout|gym|yoga|camping|hiking|sports?|dumbbell|kettlebell|treadmill|resistance bands?)\b/i],
  ["Health & Beauty", /\b(skincare|skin care|makeup|cosmetic|hair dryer|hair care|massager|wellness|toothbrush)\b/i],
  ["Pet Supplies", /\b(dog|cat|pet|puppy|kitten)\b/i],
  ["Toys & Games", /\b(toy|game|puzzle|playset|collectible)\b/i],
  ["Baby & Kids", /\b(baby|toddler|kids?|children|stroller|nursery)\b/i],
  ["Travel", /\b(luggage|suitcase|travel bag|travel backpack|packing cubes?|passport|weekender|carry.?on)\b/i],
  ["Home & Kitchen", /\b(kitchen|cookware|bakeware|dinnerware|air fryer|coffee maker|espresso machine|blender|toaster|microwave|slow cooker|pressure cooker|stand mixer|hand mixer|food processor|electric kettle|mixing bowls?|cutting board|knife set|utensils?|frying pan|saucepan|stock pot|dutch oven|spatula|food storage|dish rack|vacuum cleaner|robot vacuum|mop|broom|bedding|comforter|duvet|towel set|shower curtain|storage organizer|home decor|lamp|lighting|garden|bathroom)\b/i],
  ["Fashion", /\b(dress|shirt|jacket|shoes?|sneakers?|handbag|necklace|bracelet|earrings?|watch)\b/i],
  ["Gifts", /\b(gift|personalized|custom|keepsake|souvenir)\b/i]
];

/*
 * Words that settle an argument with the source.
 *
 * A category from a source is normally the better signal and still wins here.
 * But it can be plainly wrong, and two different ways of being wrong showed up
 * in the same aisle:
 *
 * Newegg's feed labelled 31 listings "Vehicle Parts & Accessories". Every one
 * of them was a gaming headset; not one was a vehicle part, and no other
 * Newegg category reached Automotive at all.
 *
 * For eBay the stored category is not a category — it is the search term that
 * found the listing. A graphics card that surfaced under a car-accessory
 * search was therefore filed under Automotive.
 *
 * Only unambiguous words belong here. A car monitor and a laptop car mount are
 * both real things, so "monitor" and "laptop" are deliberately absent; a
 * vehicle part that is a gaming headset is not a real thing.
 *
 * Preferring the title everywhere was measured against the live catalogue
 * first and was worse: it moved 115 listings, sending cordless drills sold
 * with "Battery and Charger Included" and office chairs described as "Computer
 * Chair" into Electronics. Hence a short list of certainties rather than a
 * general rule.
 */
const IMPOSSIBLE_FOR_CATEGORY = new Map([
  ["Automotive", /\b(headsets?|headphones?|earbuds?|graphics cards?)\b/i]
]);

function contradictsCategory(category, title) {
  const pattern = IMPOSSIBLE_FOR_CATEGORY.get(category);
  return Boolean(pattern && pattern.test(title));
}

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

  const title = fold(product.title);
  const titleMatch = firstMatch(title, TITLE_RULES);
  if (exact === "Tools & DIY" && titleMatch === "Electronics") return titleMatch;
  if (titleMatch && exact && contradictsCategory(exact, title)) return titleMatch;
  if (exact) return exact;

  const rawMatch = firstMatch(fold(raw), RAW_RULES);
  if (rawMatch === "Home & Kitchen" && ["Office", "Furniture", "Tools & DIY"].includes(titleMatch)) {
    return titleMatch;
  }
  if (titleMatch && rawMatch && contradictsCategory(rawMatch, title)) return titleMatch;
  if (rawMatch) return rawMatch;

  /*
   * For eBay the stored category is the search term that found the listing, so
   * it names a product rather than a department: "graphics card", "cordless
   * drill", "dog bed". RAW_RULES only knows department words and lets those
   * fall through to the title, which is the least reliable signal we have —
   * eBay caps a title at 80 characters, and a graphics card whose seller ran
   * out of room at "ATX Graphics Car" was read as a car part.
   *
   * The search term is better evidence than a truncated title, so try the
   * product rules on it before giving up on it.
   */
  const keywordMatch = firstMatch(fold(raw), TITLE_RULES);
  if (keywordMatch) return keywordMatch;
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
