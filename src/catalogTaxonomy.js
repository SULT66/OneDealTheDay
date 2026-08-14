const TAXONOMY_VERSION = "catalog-taxonomy-v1";

const RULES = [
  ["Mattresses", /\b(mattress|mattresses|bed mattress|matelas|matratze)\b/i],
  ["Bicycles", /\b(bicycle|bicycles|bike|bikes|tricycle|tricycles|e-?bike|velo|fahrrad)\b/i],
  ["Kitchen gadgets", /\b(kitchen|cookware|bakeware|cooking|utensil|mug|tumbler|cutting board|cuisine|kuche\w*)\b/i],
  ["Pet supplies", /\b(pet|pets|dog|dogs|cat|cats|puppy|kitten|animal|animaux|haustier|tierbedarf)\b/i],
  ["Car accessories", /\b(car|auto|automotive|vehicle|truck|voiture|automobil|autozubehor)\b/i],
  ["Travel accessories", /\b(travel|luggage|passport|suitcase|weekender|voyage|reise\w*)\b/i],
  ["Fitness accessories", /\b(fitness|exercise|workout|gym|yoga|sport|training)\b/i],
  ["Office gadgets", /\b(office|desk|computer desk|workstation|bureau|schreibtisch)\b/i],
  ["Smart home", /\b(smart home|home automation|wifi|wi-fi|alexa|google home|connected home|maison connectee)\b/i],
  ["Tools", /\b(tool|tools|drill|screwdriver|wrench|workshop|werkzeug|outillage|outils|bricolage)\b/i],
  ["Home gadgets", /\b(home|household|haushalt\w*|furniture|bookcase|shelving|shelf|cabinet|table|chair|decor|garden|maison|meuble|haus|mobel)\b/i],
  ["Gifts", /\b(gift|gifts|personalized|custom|keepsake|souvenir|cadeau|cadeaux|geschenk\w*)\b/i]
];

const EXACT = new Map([
  ["gifts under 25", "Gifts"],
  ["office gadgets", "Office gadgets"],
  ["home gadgets", "Home gadgets"],
  ["kitchen gadgets", "Kitchen gadgets"],
  ["car accessories", "Car accessories"],
  ["smart home", "Smart home"],
  ["pet supplies", "Pet supplies"],
  ["tools", "Tools"],
  ["travel accessories", "Travel accessories"],
  ["fitness accessories", "Fitness accessories"],
  ["mattresses", "Mattresses"],
  ["bicycles", "Bicycles"],
  ["tricycles", "Bicycles"],
  ["gifts", "Gifts"]
]);

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function fold(value) {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function canonicalCategory(product = {}) {
  const raw = clean(product.taxonomy_version === TAXONOMY_VERSION && product.normalized_category
    ? product.normalized_category
    : product.category);
  const exact = EXACT.get(fold(raw));
  if (exact) return exact;

  const evidence = fold([raw, product.title, product.description].map(clean).filter(Boolean).join(" "));
  for (const [category, pattern] of RULES) {
    if (pattern.test(evidence)) return category;
  }

  const source = clean(product.source).toLowerCase();
  if (source.includes("king-koil")) return "Mattresses";
  if (source.includes("mooncool")) return "Bicycles";
  if (source.includes("tribesigns")) return "Home gadgets";
  if (source.includes("giftlab")) return "Gifts";
  return raw || "Uncategorized";
}

function normalizeCatalogProduct(product = {}) {
  return {
    ...product,
    normalized_category:canonicalCategory(product),
    taxonomy_version:TAXONOMY_VERSION
  };
}

module.exports = { TAXONOMY_VERSION, canonicalCategory, normalizeCatalogProduct };
