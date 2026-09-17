/*
 * What comes back for a query that names a thing.
 *
 * "wireless earbuds under 50" matched on any single word, so "wireless" pulled
 * in a Bluetooth speaker, a replacement headset battery, a printer cable and a
 * router antenna — every one of them wireless, none of them earbuds — and
 * $179 earbuds came back for a query that said fifty.
 *
 * Three rules, checked here: the thing asked for has to be in the title, brand
 * or category; a budget in the words is a filter; and an accessory for the
 * thing is not the thing, unless the accessory is what was asked for.
 */
const assert = require("assert");
const { searchCatalogProducts } = require("../src/catalogSearch");
const { headTerm, matchesHeadTerm, looksLikeAccessory } = require("../src/ranker");

const listing = (id, title, price) => ({
  id,
  title,
  current_price: price,
  market: "us",
  currency: "USD",
  source: "ebay",
  retailer_name: "eBay",
  status: "published",
  affiliate_url: "https://example.com/item",
  image_url: "https://example.com/i.jpg",
  normalized_category: "Electronics",
  availability: "In stock",
});

const CATALOGUE = [
  listing(1, "Soundcore P20i True Wireless Earbuds Bluetooth Headphones", 20.99),
  listing(2, "JBL Flip 6 Portable Bluetooth Wireless Speaker", 89.99),
  listing(3, "Replacement Battery for Gaming Headset Wireless", 12.99),
  listing(4, "Printer Power Cable Cord Wireless Printer", 9.99),
  listing(5, "WiFi Router Antenna Wireless Extender", 15.5),
  listing(6, "TOZO T10 Wireless Earbuds Waterproof Bluetooth", 24.99),
  listing(7, "Bose QuietComfort Earbuds II Noise Cancelling", 179),
  listing(8, "Earbuds Case Silicone Cover Protector", 7.99),
  listing(9, "Dual Aluminum Headphone Stand Holder", 18.99),
];

const search = (query) =>
  searchCatalogProducts(CATALOGUE, {
    query,
    categories: [],
    merchants: [],
    sort: "best_match",
    page: 1,
    limit: 20,
    minimumMatch: 0,
    minimumQuality: 0,
  }).products.map((product) => product.id);

/* The head term is the word that names a thing, not one that describes it. */
assert.strictEqual(headTerm("wireless earbuds under 50"), "earbuds");
assert.strictEqual(headTerm("portable bluetooth speaker"), "speaker");
assert.strictEqual(headTerm("cordless drill"), "drill");
assert.strictEqual(headTerm("wireless"), "wireless", "a query of nothing but adjectives still has to search for something");
/* Plurals either way: a catalogue writes "Earbud" as often as "Earbuds". */
assert(matchesHeadTerm({ title: "Wireless Earbud Single" }, "earbuds"));
assert(matchesHeadTerm({ title: "Office Chairs, mesh" }, "chair"));
assert(!matchesHeadTerm({ title: "Bluetooth Speaker" }, "earbuds"));

const earbuds = search("wireless earbuds under 50");
assert.deepStrictEqual(
  earbuds.filter((id) => [2, 3, 4, 5].includes(id)),
  [],
  "a speaker, a battery, a printer cable and an antenna came back for earbuds",
);
assert(earbuds.includes(1) && earbuds.includes(6), "the actual earbuds are missing");
assert(!earbuds.includes(7), "$179 earbuds came back for a query that said under 50");
/* The case is allowed to appear, but never above the thing it protects. */
assert(earbuds.indexOf(8) > earbuds.indexOf(1), "an accessory outranked the product");

/* Ask for the accessory and it is the product. */
const stands = search("headphone stand");
assert.deepStrictEqual(stands, [9], "asking for a stand should return the stand");
assert(!looksLikeAccessory({ title: "Dual Aluminum Headphone Stand" }, "headphone stand"));
assert(looksLikeAccessory({ title: "Earbuds Case Silicone Cover" }, "wireless earbuds"));

/* A query with no budget keeps everything it matched. */
const allEarbuds = search("earbuds");
assert(allEarbuds.includes(7), "the budget filter fired on a query with no budget in it");

/* And an empty query is not a search: the catalogue comes back whole. */
assert.strictEqual(search("").length, CATALOGUE.length);

console.log("search relevance: ok");
