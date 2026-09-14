/*
 * Delia's answers, checked against themselves.
 *
 * Every text and title below is taken from ten real answers read back on
 * 14 Sep 2026. The cases that failed then are the cases these must now get
 * right, and the cases that were fine then must stay fine: an answer that
 * silences Delia over a word like "ZIP" is a regression too, only a quieter one.
 */
const assert = require("assert");
const {
  arrangeRecommendations,
  isRefurbishedOffer,
  measurementSizeMatch,
  namesUnshownProduct,
  outcomeCounts,
  pickFromNarrative,
  stripCitationDomains,
  wantsUsedCondition,
} = require("../src/deliaAnswerShape");

const offer = (title, retailer, price, extra = {}) => ({ title, retailer, price_value: price, ...extra });
const landedPrice = (item) => Number(item.price_value) || 0;

/* ------------------------------------------------------------ laptops */

const laptops = [
  offer("Lenovo IdeaPad Slim 3 15-inch, Ryzen 3, 8GB RAM, 256GB SSD", "Walmart", 329),
  offer("HP OmniBook 5 16-inch, Snapdragon X, 16GB RAM, 512GB SSD", "Target", 608.99),
  offer("Acer Aspire Go 15, Ryzen 5, 8GB RAM, 512GB SSD", "Acer Store", 629.99),
];
const laptopText = stripCitationDomains(
  "The best value here is the Lenovo IdeaPad Slim 3 at Walmart for $329. It is basic but well-priced for school, browsing, and office work. If you want a noticeably better screen and more premium build, I would choose the Dell XPS 13 at $699.99. These are new listings unless noted otherwise. (walmart.com)",
);

/* The failure that started this: a recommendation for a laptop not on screen. */
assert.strictEqual(
  namesUnshownProduct(laptopText, { shown: laptops }),
  true,
  "Delia named a Dell that is not in the list and it was let through",
);
/* And through the withheld path too, which used to need five-letter words. */
assert.strictEqual(
  namesUnshownProduct("I would choose the Dell XPS 13.", {
    shown: laptops,
    withheld: [offer("Dell XPS 13 9350 13.4-inch laptop", "Dell", 699.99)],
  }),
  true,
);

/* The withheld path on its own: written in lower case, so nothing looks like a
   name, and the only way to know "xps" is a product is that it was a pick. */
assert.strictEqual(
  namesUnshownProduct("honestly i would go with the xps if you can stretch.", {
    shown: laptops,
    withheld: [offer("Dell XPS 13 9350 13.4-inch laptop", "Dell", 699.99)],
  }),
  true,
  "a withheld pick named in lower case slipped through",
);

/* ------------------------------------------------------ answers that were fine */

const tvs = [
  offer("Roku 65-inch Select Series 4K QLED HDR Smart Roku TV", "Target", 399.99),
  offer("TCL 65-inch Q6 Series QLED 4K Google TV, 65Q651G", "Walmart", 429.99),
  offer("Samsung M70H 65-inch 4K HDR Mini-LED TV", "B&H Photo", 477.99),
  offer("Samsung 65-inch M70H Mini-LED 4K Smart TV", "Samsung", 529.99),
  offer("Hisense 65-inch U6 Series Mini-LED QLED 4K Smart Fire TV, 2025", "Best Buy", 549.99),
  offer("Roku 65R5D5 65-inch Select Series 4K QLED Smart TV", "Newegg", 559.99),
];
const tvText =
  "You have several strong 65-inch options under $600. I would take the Hisense U6 at Best Buy for the best picture-quality upgrade, or the Samsung M70H at Samsung for a brighter Mini-LED panel near your ceiling. If lowest price matters most, Walmart's TCL Q6 is the sensible budget pick. Prices and availability can vary by ZIP code.";
assert.strictEqual(
  namesUnshownProduct(tvText, { shown: tvs }),
  false,
  "a TV answer that names only what is on screen was treated as naming something else",
);

const airpods = [
  offer("Apple AirPods Pro 3 In-Ear Bluetooth Earbuds, White", "Walmart", 225),
  offer("Apple AirPods Pro 3 with Wireless MagSafe Charging Case, USB-C", "B&H Photo", 229),
];
const airpodsText = stripCitationDomains(
  "For the same new AirPods Pro 3, Walmart has the lowest confirmed price at $225.00, while B&H is $229.00 with free 2-day shipping. I would take Walmart for the $4 savings, unless you prefer B&H's authorized-dealer listing and clearer stock status. (walmart.com)",
);
assert.strictEqual(namesUnshownProduct(airpodsText, { shown: airpods }), false);

const coffee = [
  offer("Keurig K-Mini Go Single-Serve K-Cup Pod Coffee Maker", "Target", 69.99),
  offer("New Keurig K Supreme Single Serve Coffee Maker new and sealed Free Shipping", "eBay", 74.95),
  offer("Keurig K-Mini Single-Serve K-Cup Pod Coffee Maker, Evergreen Black", "Best Buy", 78),
  offer("Keurig K-Supreme Single-Serve K-Cup Pod Coffee Maker", "Target", 89.99),
  offer("Cuisinart Single-Serve Coffee Maker + Coffee Grinder with 8 oz., 10 oz., and 12", "eBay", 133.34),
];
const coffeeText = stripCitationDomains(
  "I found several coffee makers under $150, with the strongest overall choice being the Keurig K-Supreme at Target when its sale price is available. For the lowest confirmed price, the new sealed Keurig K-Supreme on eBay is the standout, while the Best Buy K-Mini is the better compact option. Prices can vary by color and seller, so check the product page before ordering. (target.com)",
);
assert.strictEqual(namesUnshownProduct(coffeeText, { shown: coffee }), false);

/* ------------------------------------------------------------ citations */

assert.ok(!laptopText.includes("walmart.com"));
assert.strictEqual(stripCitationDomains("Cheapest at Walmart (walmart.com, target.com)."), "Cheapest at Walmart.");
/* A price in brackets, or a real sentence in brackets, is not a citation. */
assert.strictEqual(stripCitationDomains("It is $399 (on sale)."), "It is $399 (on sale).");
assert.strictEqual(stripCitationDomains("Version 2.0 (2025) is newer."), "Version 2.0 (2025) is newer.");

/* ------------------------------------------------------ the pick follows the words */

/* Coffee: the sentence recommends the K-Supreme at Target, not the one on eBay. */
assert.strictEqual(coffee[pickFromNarrative(coffeeText, coffee)].retailer, "Target");
assert.match(coffee[pickFromNarrative(coffeeText, coffee)].title, /K-Supreme/);
/* TV: the first product named is the Hisense at Best Buy. */
assert.match(tvs[pickFromNarrative(tvText, tvs)].title, /Hisense/);
/* No product named, no pick claimed from the text. */
assert.strictEqual(pickFromNarrative("Here are a few good options.", tvs), -1);

/* ---------------------------------------------------------------- groups */

const arrangedCoffee = arrangeRecommendations(coffee, { request: "coffee machine under $150", narrative: coffeeText, landedPrice });
assert.strictEqual(arrangedCoffee[0].position_role, "best_overall");
assert.match(arrangedCoffee[0].title, /K-Supreme/);
assert.strictEqual(arrangedCoffee[0].retailer, "Target", "the badge and the sentence must name the same listing");
/* The cheaper option is well ranked and costs less than the pick; the lowest
   price is the cheapest of all; neither repeats the pick. */
const roles = Object.fromEntries(arrangedCoffee.map((item) => [item.position_role, item]));
assert.ok(roles.cheaper_option && landedPrice(roles.cheaper_option) < landedPrice(arrangedCoffee[0]));
assert.strictEqual(roles.lowest_price.price_value, 69.99);
assert.deepStrictEqual(arrangedCoffee.slice(0, 3).map((item) => item.position_role), ["best_overall", "cheaper_option", "lowest_price"]);
/* Everything after the groups is in price order. */
const after = arrangedCoffee.slice(3).map(landedPrice);
assert.deepStrictEqual(after, [...after].sort((a, b) => a - b));
assert.strictEqual(arrangedCoffee.length, coffee.length, "nothing may be dropped by arranging");

/* Headphones: the pick used to sit sixth because the list was re-sorted by price. */
const headphones = [
  offer("Sony WHCH720N Wireless Noise Cancelling Headphones", "Best Buy", 98),
  offer("Audio-Technica ATH-M20xBT Wireless Over-Ear Headphones", "B&H Photo Video", 89),
  offer("CMF by Nothing Headphone Pro", "Walmart", 79),
  offer("AIWA ARC Noise Cancelling Over Ear Wireless Headphones", "Target", 79.99),
  offer("Tws Wireless Earbuds Bluetooth 5.0 Waterproof Noise Cancelling In-Ear Earphones", "eBay", 21.99),
];
const arrangedHeadphones = arrangeRecommendations(headphones, { request: "headphones under $100", landedPrice });
assert.match(arrangedHeadphones[0].title, /Sony/, "the pick must come first, not sixth");

/* A pick that is also the cheapest is one card marked twice, not two cards. */
const cheapestIsPick = arrangeRecommendations(
  [offer("A", "Shop A", 10), offer("B", "Shop B", 20), offer("C", "Shop C", 30)],
  { request: "thing", landedPrice },
);
assert.strictEqual(cheapestIsPick[0].position_role, "best_overall");
assert.strictEqual(cheapestIsPick[0].lowest_price, true);
assert.ok(!cheapestIsPick.some((item) => item.position_role === "lowest_price"));

/* "Cheapest PS5": price was the question, so no pick unless she named one. */
const ps5 = [
  offer("Sony PlayStation 5 Console", "GameStop", 519.99),
  offer("Restored PlayStation 5 Console 825GB SSD", "Walmart", 499),
  offer("PlayStation 5 Slim Disc Console NBA 2K26 Bundle", "GameStop", 549.99),
];
const arrangedPs5 = arrangeRecommendations(ps5, { request: "cheapest PS5", landedPrice, lowerPriceRequested: true });
assert.ok(!arrangedPs5.some((item) => item.position_role === "best_overall"));
/* The restored console is cheaper, and still not "Lowest price": it is not new. */
const lowestPs5 = arrangedPs5.find((item) => item.position_role === "lowest_price");
assert.strictEqual(lowestPs5.title, "Sony PlayStation 5 Console");
const restored = arrangedPs5.find((item) => /Restored/.test(item.title));
assert.strictEqual(restored.condition, "refurbished", "a restored console must say it is not new");
/* Unless the shopper asked for used or refurbished. */
const usedPs5 = arrangeRecommendations(ps5, { request: "cheapest refurbished PS5", landedPrice, lowerPriceRequested: true });
assert.match(usedPs5.find((item) => item.position_role === "lowest_price").title, /Restored/);

/* A comparison keeps the order it was asked in. */
const compared = arrangeRecommendations(airpods, { request: "compare", landedPrice, isComparison: true });
assert.deepStrictEqual(compared.map((item) => item.retailer), ["Walmart", "B&H Photo"]);

/* ------------------------------------------------------------ condition */

assert.strictEqual(isRefurbishedOffer(offer("Restored PlayStation 5 Console", "Walmart", 1)), true);
assert.strictEqual(isRefurbishedOffer(offer("Apple iPhone 15 - Renewed", "Amazon", 1)), true);
assert.strictEqual(isRefurbishedOffer(offer("Laptop (Used)", "eBay", 1)), true);
assert.strictEqual(isRefurbishedOffer(offer("Headphones widely used for gaming", "Target", 1)), false);
assert.strictEqual(wantsUsedCondition("a used camera"), true);
assert.strictEqual(wantsUsedCondition("a camera for my used car"), true, "over-matching here only relaxes a label, which is the safe direction");
assert.strictEqual(wantsUsedCondition("a new camera"), false);

/* ---------------------------------------------------------------- counts */

/* Six chairs, five from eBay: six options at two shops, not six shops. */
const chairs = [
  offer("Office Chair Ergonomic", "eBay", 69.99), offer("Black Office Chair", "eBay", 69.99),
  offer("Office Chair Executive", "eBay", 89.99), offer("Computer Desk Chair", "eBay", 93.99),
  offer("500LBS Big and Tall Office Chair", "eBay", 129.99), offer("CENTERHALV Office Chair, Black", "IKEA", 199.99),
];
assert.deepStrictEqual(outcomeCounts(chairs), { products: 6, shops: 2, retailer: "eBay" });
/* One product at several shops counts its other offers as shops. */
assert.deepStrictEqual(
  outcomeCounts([offer("Sony WH-CH720N", "Best Buy", 98, { other_offers: [{ retailer: "eBay" }, { retailer: "Target" }] })]),
  { products: 1, shops: 3, retailer: "Best Buy" },
);

/* ------------------------------------------------------------------ sizes */

/* The SSD answer that said nothing matched. */
assert.strictEqual(measurementSizeMatch("Crucial P310 1TB NVMe SSD", "1TB"), true);
assert.strictEqual(measurementSizeMatch("WD BLACK SN850X 1TB NVMe SSD", "1 TB"), true);
assert.strictEqual(measurementSizeMatch("Samsung 990 EVO 1000GB NVMe", "1TB"), true);
assert.strictEqual(measurementSizeMatch("Samsung 990 EVO 2TB NVMe", "1TB"), false);
assert.strictEqual(measurementSizeMatch("Maple syrup 32 fl oz bottle", "32 oz"), true);
assert.strictEqual(measurementSizeMatch("Queen size memory foam mattress", "queen"), true);
assert.strictEqual(measurementSizeMatch("King size memory foam mattress", "queen"), false);
/* Not a measurement: left to the clothing check, which it always was. */
assert.strictEqual(measurementSizeMatch("Running shoe", "10"), null);
assert.strictEqual(measurementSizeMatch("T-shirt", "M"), null);

/* ------------------------------------------- the same product, listed twice */

const { deduplicateRecommendations, regionalOutcomeMessage } = require("../src/shoppingAssistant");
const listing = (title, retailer, price, slug) => ({
  title, retailer, price_value: price, price: `$${price}`, currency: "USD",
  url: `https://www.${slug}.com/p/${encodeURIComponent(title).slice(0, 24)}`, source_type: "web",
});

/* The Sony pair from the headphones answer: WH-CH720N and WHCH720N. */
const sonyPair = deduplicateRecommendations([
  listing("Sony WHCH720N Wireless Noise Cancelling Headphones", "Best Buy", 98, "bestbuy"),
  listing("Sony WH-CH720N Wireless Over-Ear Headphones - Blue - WHCH720N BRAND NEW", "eBay", 69, "ebay"),
]);
assert.strictEqual(sonyPair.length, 1, "the same Sony model was shown as two products");
assert.strictEqual(sonyPair[0].other_offers.length, 1, "the second listing should become another place to buy it");

/* The Samsung pair from the TV answer, one printing the size before the model. */
assert.strictEqual(
  deduplicateRecommendations([
    listing("Samsung M70H 65-inch 4K HDR Mini-LED TV", "B&H Photo", 477.99, "bhphotovideo"),
    listing("Samsung 65-inch M70H Mini-LED 4K Smart TV", "Samsung", 529.99, "samsung"),
  ]).length,
  1,
  "a size printed before the model number kept one TV apart from itself",
);

/* And the reason the size is in the key: three Frames, three sizes, three prices. */
assert.strictEqual(
  deduplicateRecommendations([
    listing("Samsung 55-inch The Frame LS03D 4K TV", "Best Buy", 1349.99, "bestbuy"),
    listing("Samsung 65-inch The Frame LS03D 4K TV", "Best Buy", 1799.99, "bestbuy2"),
    listing("Samsung 50-inch The Frame LS03D 4K TV", "Walmart", 999.99, "walmart"),
  ]).length,
  3,
  "different sizes of one television were merged into a single product",
);
/* Capacity is a size too. */
assert.strictEqual(
  deduplicateRecommendations([
    listing("Samsung 990 EVO 1TB NVMe SSD MZ-V9E1T0", "Newegg", 89.99, "newegg"),
    listing("Samsung 990 EVO 2TB NVMe SSD MZ-V9E1T0", "Amazon", 149.99, "amazon"),
  ]).length,
  2,
);

/* ------------------------------------------------------------ the sentence */

const say = (recommendations) =>
  regionalOutcomeMessage({ language: "en", marketCode: "us", currency: "USD", recommendations, partialOffers: [], resultState: "exact_matches" });
assert.strictEqual(say(chairs), "I found 6 options at 2 shops. Here is where I would look first. Prices in USD.");
assert.strictEqual(say(chairs.slice(0, 5)), "I found 5 options at eBay. Prices in USD.");
assert.strictEqual(say(sonyPair), "I found it at 2 shops. Prices in USD.");
assert.strictEqual(say([offer("One lamp", "IKEA", 20)]), "I found one option at IKEA. Price in USD.");
assert.ok(!/shops selling it/.test(say(headphones)), "the old sentence is still being used");

console.log("Delia answer shape passed.");
