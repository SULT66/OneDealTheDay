const assert = require("assert");
const { applySearchIntent, parseSearchIntent } = require("../src/searchIntent");

const context = {
  categories:["Home gadgets", "Gifts", "Footwear > Sneakers"],
  merchants:["eBay", "Giftlab", "Tribesigns"],
};

const natural = parseSearchIntent("office chair under $200 at eBay", context);
assert.strictEqual(natural.query, "office chair");
assert.strictEqual(natural.merchant, "eBay");
assert.strictEqual(natural.maximumPrice, 200);
assert.deepStrictEqual(natural.inferred, ["merchant", "max_price"]);

const categoryRange = parseSearchIntent("Gifts between $25 and $75", context);
assert.strictEqual(categoryRange.query, "");
assert.strictEqual(categoryRange.category, "Gifts");
assert.strictEqual(categoryRange.minimumPrice, 25);
assert.strictEqual(categoryRange.maximumPrice, 75);

const explicitWins = applySearchIntent(
  {q:"Gifts under $75 at Giftlab", merchant:"eBay", max_price:"50"},
  [
    {normalized_category:"Gifts", retailer_name:"Giftlab"},
    {normalized_category:"Home gadgets", retailer_name:"eBay"},
  ],
);
assert.strictEqual(explicitWins.query.merchant, "eBay", "An explicit merchant filter was overwritten");
assert.strictEqual(explicitWins.query.max_price, "50", "An explicit price filter was overwritten");
assert.strictEqual(explicitWins.query.category, "Gifts");
assert.deepStrictEqual(explicitWins.intent.inferred, ["category"], "Delia claimed filters that explicit controls overrode");
assert.strictEqual(explicitWins.intent.merchant, "");
assert.strictEqual(explicitWins.intent.maximumPrice, null);

for (const [query, expected] of [
  ["chaussures moins de 120", 120],
  ["Schuhe unter 140", 140],
  ["zapatos hasta 90", 90],
  ["кроссовки до 150", 150],
]) {
  assert.strictEqual(parseSearchIntent(query, context).maximumPrice, expected, `Budget was not parsed: ${query}`);
}

console.log("Day 12 Delia intent parser constraints passed.");
