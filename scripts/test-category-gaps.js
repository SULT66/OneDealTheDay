/*
 * Filling the thin categories, and reaching the source that can fill them.
 *
 * A week after the gap plan started running, Travel still held 5 listings and
 * Automotive 11 — the same as the week before. Two reasons, and this file
 * guards against both coming back.
 *
 * The plan was computed only for AliExpress, which sits at its
 * ALIEXPRESS_MAX_PRODUCTS ceiling and had no room to add anything. And it is
 * the wrong source anyway: of the catalogue's listings, eBay is the only one
 * that returns product reviews and sold counts, so filling a category from
 * AliExpress makes it look full while making the share that can carry a Score
 * worse.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { SHELVES, gapKeywords, planGapSearches } = require("../src/categoryGaps");

/*
 * The live counts on 2026-10-15, every shelf included.
 *
 * All of them, because a category missing from the counts has no listings at
 * all and is therefore the thinnest thing there is — correct behaviour, and
 * the reason a partial fixture produces a plan full of categories that are in
 * fact the largest ones.
 */
const rows = [
  { category: "Travel", count: 5 },
  { category: "Automotive", count: 11 },
  { category: "Mattresses & Sleep", count: 13 },
  { category: "Baby & Kids", count: 30 },
  { category: "Furniture", count: 39 },
  { category: "Tools & DIY", count: 46 },
  { category: "Toys & Games", count: 48 },
  { category: "Pet Supplies", count: 49 },
  { category: "Fashion", count: 53 },
  { category: "Health & Beauty", count: 57 },
  { category: "Bikes & Mobility", count: 57 },
  { category: "Arts & Crafts", count: 100 },
  { category: "Home & Kitchen", count: 161 },
  { category: "Office", count: 174 },
  { category: "Sports & Outdoors", count: 255 },
  { category: "Gifts", count: 279 },
  { category: "Electronics", count: 1258 },
];

const now = Date.parse("2026-10-16T09:00:00Z");

/* ------------------------------------------------------------- the plan */

const plan = planGapSearches(rows, { target: 100, limit: 8, now });
assert.deepStrictEqual(
  plan.map(entry => entry.category),
  ["Travel", "Automotive", "Mattresses & Sleep", "Baby & Kids", "Furniture", "Tools & DIY", "Toys & Games", "Pet Supplies"],
  "the plan is not working on the eight thinnest categories, in order of need",
);
assert.strictEqual(plan[0].missing, 95, "the shortfall is not counted against the target");

/* A category already at the target is not chased. */
assert.ok(
  !planGapSearches(rows, { target: 40, limit: 8, now }).some(entry => entry.category === "Pet Supplies"),
  "a category above the target was still being filled",
);
assert.ok(
  !plan.some(entry => entry.category === "Electronics"),
  "the largest category was treated as a gap",
);

/* A category with no listings at all is the thinnest thing there is, and the
   counts simply do not mention it. */
assert.strictEqual(
  planGapSearches(rows.filter(row => row.category !== "Travel"), { target: 100, limit: 1, now })[0].category,
  "Travel",
  "a category absent from the counts was not treated as empty",
);

/* ---------------------------------------------------- the search terms */

const terms = gapKeywords(rows, { target: 100, limit: 8, perCategory: 2, now });
assert.strictEqual(terms.length, 16, `expected two terms for each of eight categories, got ${terms.length}`);
assert.strictEqual(new Set(terms).size, terms.length, "the same phrase was searched twice in one run");

/*
 * Consecutive runs search different phrases.
 *
 * Without this a category fills with ten versions of whatever the single
 * keyword returns, which is a thin category wearing a different hat.
 */
const later = gapKeywords(rows, { target: 100, limit: 8, perCategory: 2, now: now + 6 * 3600 * 1000 });
assert.notDeepStrictEqual(terms, later, "every run searches the same phrases");
assert.ok(
  later.some(term => !terms.includes(term)),
  "the next run brings no phrase the last one did not already use",
);

/* Every shelf has enough phrases to be worth rotating through. */
for (const [category, keywords] of Object.entries(SHELVES)) {
  assert.ok(Array.isArray(keywords) && keywords.length >= 5, `${category} has only ${keywords.length} search phrases`);
  assert.strictEqual(new Set(keywords).size, keywords.length, `${category} repeats a phrase`);
}
for (const entry of plan) {
  assert.ok(
    SHELVES[entry.category].length >= 10,
    `${entry.category} is one of the thinnest and has only ${SHELVES[entry.category].length} phrases to fill it with`,
  );
}

/* ------------------------------------------------- and it reaches eBay */

/*
 * The whole point. The terms have to land on the list eBay is handed, not
 * only in the AliExpress plan — that was the bug, and it is invisible unless
 * something checks the wiring.
 */
const refresh = fs.readFileSync(path.join(__dirname, "..", "src", "refresh.js"), "utf8");
assert.ok(
  /gapKeywords\(/.test(refresh),
  "src/refresh.js no longer computes gap search terms",
);
assert.ok(
  /searchKeywords:[\s\S]{0,200}gapTerms/.test(refresh),
  "the gap terms are computed but never reach searchKeywords, which is the only list eBay is given",
);
assert.ok(
  !fs.existsSync(path.join(__dirname, "..", "src", "aliexpressGaps.js")),
  "the AliExpress-only version of this module is back",
);


// Every phrase must get a turn under the actual six-hour schedule. The old
// three-hour rotation visited only even positions in ten-keyword shelves.
for (const category of ['Travel', 'Automotive', 'Mattresses & Sleep']) {
  const visited = new Set();
  for (let run = 0; run < SHELVES[category].length; run++) {
    const entry = planGapSearches(rows, {now:run * 6 * 3600 * 1000})
      .find(entry => entry.category === category);
    visited.add(entry.keyword);
  }
  assert.deepStrictEqual([...visited].sort(), [...SHELVES[category]].sort());
}

console.log("category gap checks passed.");
