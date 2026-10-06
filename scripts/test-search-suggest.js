/*
 * The promise the search box makes while it is being typed into.
 *
 * A suggestion is a claim about a shelf: pick this and you will find things.
 * The one failure that matters is a term that leads to "no matches", because a
 * shopper reads that as an empty shop rather than as a bad guess by the box.
 * So the central assertion here is not about wording — it runs every phrase
 * the box would offer through the same search the results page uses and
 * insists that something comes back.
 *
 * The rest guards the two rules that make the wording usable: phrases come
 * from what listings were found by before they come from headlines, and a
 * phrase has to name a thing rather than describe one. See src/searchSuggest.js.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { isUnavailable, parseSearchOptions, searchCatalogProducts } = require("../src/catalogSearch");
const { buildSuggestIndex, suggestTerms } = require("../src/searchSuggest");

const product = (id, overrides = {}) => ({
  id,
  external_id: `offer-${id}`,
  provider_external_id: `offer-${id}`,
  market: "us",
  product_key: `product-${id}`,
  title: `Useful product ${id}`,
  description: "A useful catalog product",
  brand: "Example",
  category: "office chair",
  normalized_category: "Office",
  image_url: `https://i.ebayimg.com/images/g/${id}/s-l1600.jpg`,
  affiliate_url: `https://merchant.example.com/${id}`,
  retailer_name: "eBay",
  source: "ebay",
  availability: "In stock",
  current_price: 100 + id,
  currency: "USD",
  rating: 4.6,
  review_count: 250,
  status: "published",
  updated_at: "2026-09-20T12:00:00.000Z",
  ...overrides,
});

const rows = [
  product(1, { title: "Ergonomic office chair with lumbar support", current_price: 120 }),
  product(2, { title: "Ergonomic office chair, black mesh", current_price: 140 }),
  product(3, { title: "High back office chair executive leather", current_price: 160 }),
  product(4, { title: "Mesh office chair for home office", current_price: 110 }),
  product(10, { title: "Mesh office chair swivel seat", current_price: 125 }),
  product(5, { title: "Smart thermostat with room sensor", category: "smart thermostat", normalized_category: "Home & Kitchen", current_price: 130 }),
  product(6, { title: "Smart thermostat programmable", category: "smart thermostat", normalized_category: "Home & Kitchen", current_price: 150 }),
  /* One of a kind, so nothing about it is a shelf. */
  product(7, { title: "Lift top coffee table walnut", category: "coffee table", normalized_category: "Furniture", current_price: 220 }),
  /* Two listings, but neither can be bought. */
  product(8, { title: "Inflatable camping tent four person", category: "camping tent", normalized_category: "Sports & Outdoors", availability: "Out of stock", current_price: 300 }),
  product(9, { title: "Inflatable camping tent six person", category: "camping tent", normalized_category: "Sports & Outdoors", availability: "Out of stock", current_price: 340 }),
];

/* The endpoint builds its vocabulary from what a shopper could actually buy,
   which is the same set search will answer from. */
const index = buildSuggestIndex(rows.filter(row => !isUnavailable(row)));
const phrasesFor = query => suggestTerms(index, query).map(item => item.phrase);

/* The promise: nothing offered is a dead end. */
for (const typed of ["of", "off", "office", "chai", "chair", "ther", "smart", "mesh"]) {
  for (const { phrase, count } of suggestTerms(index, typed)) {
    const found = searchCatalogProducts(rows, parseSearchOptions({ q: phrase }));
    assert.ok(
      found.pagination.total > 0,
      `"${phrase}" is offered for "${typed}" but the results page answers it with nothing`,
    );
    assert.ok(count > 0, `"${phrase}" is offered without a count`);
  }
}

/* The phrase listings were found by comes first: it is a question somebody
   asked, not a slice of somebody's headline. */
assert.strictEqual(phrasesFor("off")[0], "office chair");
assert.strictEqual(phrasesFor("ther")[0], "smart thermostat");

/* A phrase has to name a thing. "chair ergonomic" is a window cut out of a
   title and reads as a bug, however many listings contain those two words. */
assert.ok(!phrasesFor("chair").includes("chair ergonomic"), "a headline fragment was offered as a search");
assert.ok(!phrasesFor("chair").includes("chair black"), "a colour was offered as the end of a search");
assert.ok(phrasesFor("chair").includes("office chair"), "the obvious search for \"chair\" was not offered");

/* What a shopper might have meant, not only what they are typing: "mesh"
   reaches a chair even though no phrase starts with it. */
assert.ok(phrasesFor("mesh").some(phrase => phrase.includes("office chair")), "a mid-phrase match was lost");

/* One listing is not a shelf. */
assert.ok(!phrasesFor("coff").length, "a phrase only one listing uses was offered as a search");

/* Neither is a shelf of things nobody can buy. */
assert.ok(!phrasesFor("camp").length, "an unavailable listing put a word in the search box");
assert.ok(!phrasesFor("tent").length, "an unavailable listing put a word in the search box");

/* "thermostat" and "smart thermostat" hold the same two listings; printing
   both is one suggestion twice, and the curated one wins. */
const thermostats = phrasesFor("therm");
assert.ok(thermostats.includes("smart thermostat"));
assert.ok(!thermostats.includes("thermostat"), "the same shelf was offered under two names");

/* One letter is not a question. */
assert.deepStrictEqual(suggestTerms(index, "o"), []);
assert.deepStrictEqual(suggestTerms(index, ""), []);
assert.deepStrictEqual(suggestTerms(null, "office"), []);

/* Nothing unbounded reaches the dropdown. */
assert.ok(suggestTerms(index, "office", { limit: 2 }).length <= 2);

/* The endpoint, as the browser will call it: same search underneath, thumbnails
   small enough for a list that changes on every keystroke, and a link the
   frontend does not have to assemble. */
const server = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
assert.ok(server.includes('app.get("/api/search/suggest"'), "the suggestion endpoint is missing");
assert.ok(server.includes("searchCatalogProducts(rows, options)"), "suggestions must come from the same search as the results page");
assert.ok(/suggestThumbnail = url =>[\s\S]*?s-l500/.test(server), "a dropdown must not load full-size photographs");
assert.ok(server.includes("filter(row => !isUnavailable(row))"), "the vocabulary must exclude what cannot be bought");
assert.ok(/if \(query\.length < 2\) return res\.json\(emptyAnswer\);/.test(server), "one letter must not cost a search");

/* And the box itself still works without any of this. */
const box = fs.readFileSync(path.join(__dirname, "..", "components", "site", "SearchBox.tsx"), "utf8");
assert.ok(box.includes('action={`/${market}/search`}') && box.includes('method="get"'), "the form stopped working without JavaScript");
assert.ok(box.includes('name="q"'), "the query field lost its name");
assert.ok(box.includes('role="combobox"') && box.includes('role="listbox"'), "the dropdown is not reachable by keyboard or screen reader");
assert.ok(box.includes("AbortController"), "a slow answer could overtake a newer one");

console.log("search suggestions: ok");
