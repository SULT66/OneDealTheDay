const BRAND_ALIASES = new Map([
  ["apple inc", "Apple"], ["apple computer", "Apple"], ["apple", "Apple"],
  ["samsung electronics", "Samsung"], ["samsung", "Samsung"],
  ["lg electronics", "LG"], ["lg", "LG"],
  ["hewlett packard", "HP"], ["hp", "HP"],
  ["dell technologies", "Dell"], ["dell", "Dell"],
  ["lenovo group", "Lenovo"], ["lenovo", "Lenovo"],
  ["asus", "ASUS"], ["asustek", "ASUS"], ["acer", "Acer"], ["msi", "MSI"],
  ["sony corporation", "Sony"], ["sony", "Sony"], ["bose", "Bose"], ["jbl", "JBL"],
  ["google", "Google"], ["microsoft", "Microsoft"], ["amazon", "Amazon"],
  ["dyson", "Dyson"], ["shark", "Shark"], ["ninja", "Ninja"], ["kitchenaid", "KitchenAid"],
  ["instant pot", "Instant Pot"], ["philips", "Philips"], ["braun", "Braun"],
  ["canon", "Canon"], ["nikon", "Nikon"], ["fujifilm", "Fujifilm"], ["gopro", "GoPro"],
  ["garmin", "Garmin"], ["fitbit", "Fitbit"], ["anker", "Anker"], ["soundcore", "Soundcore"],
  ["logitech", "Logitech"], ["razer", "Razer"], ["corsair", "Corsair"], ["steelseries", "SteelSeries"],
  ["tp-link", "TP-Link"], ["netgear", "NETGEAR"], ["linksys", "Linksys"], ["ring", "Ring"],
  ["ecobee", "ecobee"], ["roku", "Roku"], ["hisense", "Hisense"], ["tcl", "TCL"],
  ["vizio", "Vizio"], ["panasonic", "Panasonic"], ["electrolux", "Electrolux"],
  ["whirlpool", "Whirlpool"], ["ge appliances", "GE Appliances"], ["frigidaire", "Frigidaire"],
  ["maytag", "Maytag"], ["dewalt", "DEWALT"], ["milwaukee", "Milwaukee"], ["makita", "Makita"],
  ["bosch", "Bosch"], ["black+decker", "BLACK+DECKER"], ["black and decker", "BLACK+DECKER"],
  ["craftsman", "CRAFTSMAN"], ["stanley", "STANLEY"], ["keurig", "Keurig"], ["nespresso", "Nespresso"],
  ["cuisinart", "Cuisinart"], ["vitamix", "Vitamix"], ["nutribullet", "Nutribullet"],
  ["oral-b", "Oral-B"], ["colgate", "Colgate"], ["lego", "LEGO"], ["mattel", "Mattel"],
  ["hasbro", "Hasbro"], ["nike", "Nike"], ["adidas", "Adidas"], ["puma", "Puma"],
  ["under armour", "Under Armour"], ["new balance", "New Balance"], ["skechers", "Skechers"]
]);

const DETECTION_NAMES = [...BRAND_ALIASES.keys()].sort((a, b) => b.length - a.length);

function normalizeBrand(value) {
  const raw = String(value || "").replace(/®|™/g, "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/[.,]+$/g, "").trim();
  return BRAND_ALIASES.get(key) || raw.split(" ").map(part => part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part).join(" ");
}

function detectBrand(product = {}) {
  const direct = normalizeBrand(product.brand || product.manufacturer);
  if (direct) return direct;
  const haystack = `${product.title || ""} ${product.description || ""}`.toLowerCase();
  for (const candidate of DETECTION_NAMES) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack)) return BRAND_ALIASES.get(candidate);
  }
  return "";
}

function slugifyBrand(value) {
  return normalizeBrand(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

module.exports = { detectBrand, normalizeBrand, slugifyBrand };
