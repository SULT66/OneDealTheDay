/*
 * The order search results come back in.
 *
 * A search for "office chair" asked the backend for best matches, got twelve
 * chairs at relevance 100, and then sorted them by Deal Score before drawing
 * them. Fewer than one listing in a hundred carries a score, so the few that
 * did went to the top whatever they were: printer paper, three label makers,
 * ink cartridges and a paper shredder filled the first six places, and the
 * first chair sat seventh. The ranking was correct the whole way and thrown
 * away in the last step.
 *
 * This is frontend code with no test runner of its own, so the sorting module
 * is compiled with the project's own TypeScript and exercised directly rather
 * than left to be checked by eye on a deployed page.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const out = fs.mkdtempSync(path.join(os.tmpdir(), "odd-sort-"));
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "typescript", "bin", "tsc"),
    path.join(root, "lib", "filter.ts"),
    "--outDir", out,
    "--module", "commonjs",
    "--target", "es2022",
    "--skipLibCheck",
  ],
  { stdio: "pipe" },
);
const { applyFilter, sortDeals } = require(path.join(out, "filter.js"));

/* What the backend returned for "office chair", in its order: chairs, none of
   which carries a score, and one high-scoring stationery listing further down
   that matched on the word "office" alone. */
const deal = (rank, title, score) => ({
  id: String(rank), title, brand: "", category: "office", retailer: "eBay",
  price: 100 + rank, referencePrice: null, rating: 0, reviewCount: 0,
  score, rank,
});
const results = [
  deal(1, "Big and Tall Office Chair 400lbs Capacity", null),
  deal(2, "Ergonomic Office Chair Mesh Desk Chair", null),
  deal(3, "Costway PU Leather Office Chair Swivel", null),
  deal(4, "Hammermill Printer Paper, 5 Ream", 89),
  deal(5, "Brother Label Maker For Ribbons & Labels", 88),
];

const firstTitle = (list) => list[0].title;

/* No sort chosen — the case every visitor arriving from an ad is in. */
assert.match(
  firstTitle(sortDeals(results, "relevance")),
  /Office Chair/,
  "a search with no chosen sort no longer leads with what it was asked for",
);

/* Asking for quality still gives quality: the point is which one is the
   default, not that one of them is wrong. */
assert.match(
  firstTitle(sortDeals(results, "score")),
  /Printer Paper/,
  "sorting by score should still put the highest score first",
);

/* The filter panel removes things from the middle of the ranking; what is
   left must stay in the ranking's order rather than fall back to score. */
const survivors = applyFilter(results, { maxPrice: 104, sort: "relevance" });
assert.deepStrictEqual(
  survivors.map((product) => product.rank),
  [1, 2, 3, 4],
  "filtering scrambled the search ranking",
);

const { listingFacets } = require(path.join(out, "filter.js"));
const matching = [
  {...deal(1,"Laptop",null),retailer:"A",price:500},
  {...deal(2,"Laptop",null),retailer:"B",price:1000},
  {...deal(3,"Laptop",null),retailer:"A",price:100000},
];
assert.deepStrictEqual(listingFacets(matching,{maxPrice:600}).retailers,["A"]);
assert.deepStrictEqual(listingFacets(matching,{retailer:"B"}).price,{min:1000,max:1001});
assert(listingFacets(matching,{}).price.max < 100000,"An outlier flattened the slider");
assert.strictEqual(applyFilter(matching,{maxPrice:1500}).length,2,"Explicit ceiling was not applied");

/* --------------------------------- what each choice would actually leave -- */

/*
 * Three of the five filters on the panel hide most of the catalogue for a
 * reason that has nothing to do with quality. Measured on the live market:
 * 15% of listings carry a product rating at all, 8% a published Score, 31% a
 * reference price. So "4★ and up" means, in practice, "and sold by one of the
 * shops that publishes reviews" — it removed 86% of the shelf and nothing said
 * so until it was pressed.
 */
const { listingCounts, priceBuckets, PRICE_FILTER_MIN_LISTINGS } = require(path.join(out, "filter.js"));

const shelf = [
  { ...deal(1, "Chair", 90), retailer: "Newegg", price: 20, rating: 0, reviewCount: 0, referencePrice: null },
  { ...deal(2, "Chair", null), retailer: "Newegg", price: 40, rating: 0, reviewCount: 0, referencePrice: null },
  { ...deal(3, "Chair", null), retailer: "eBay", price: 300, rating: 4.6, reviewCount: 30, referencePrice: 400 },
];
const counts = listingCounts(shelf, {});
assert.strictEqual(counts.total, 3);
assert.deepStrictEqual(counts.retailers, [{ value: "Newegg", count: 2 }, { value: "eBay", count: 1 }].sort((a, b) => a.value < b.value ? -1 : 1));

/* The number beside an option is the number that option leaves, counted
   against everything else already chosen — and its own dimension left out. */
assert.deepStrictEqual(counts.rating.map(r => r.count), [3, 1, 1], "the rating options are not counted against the current state");
assert.deepStrictEqual(counts.score.map(r => r.count), [3, 1, 1]);
assert.strictEqual(counts.discounted, 1);

/* Pick the shop that publishes no reviews and the rating options say zero,
   which is the truth about the shop rather than about the goods. */
const neweggOnly = listingCounts(shelf, { retailer: "Newegg" });
assert.strictEqual(neweggOnly.total, 2);
assert.deepStrictEqual(neweggOnly.rating.map(r => r.count), [2, 0, 0], "a dead end was still offered as a live option");
assert.strictEqual(neweggOnly.retailers.find(r => r.value === "eBay").count, 1, "a shop may not count itself out of its own dimension");

/* A catalogue small enough to read is not one worth filtering by price. */
assert.deepStrictEqual(priceBuckets(shelf), [], "a three item shelf was given price bands");
const big = Array.from({ length: PRICE_FILTER_MIN_LISTINGS + 10 }, (_, index) => ({
  ...deal(100 + index, "Thing", null), retailer: "eBay", price: (index + 1) * 7,
}));
const bands = priceBuckets(big);
assert.ok(bands.length >= 2 && bands.length <= 4, "price bands should be a handful, not a histogram");
assert.strictEqual(bands[0].min, 0);
assert.strictEqual(bands[bands.length - 1].max, undefined, "the top band has to stay open ended");
assert.strictEqual(bands.reduce((sum, band) => sum + band.count, 0), big.length, "the bands lost or double counted listings");
assert.ok(bands.every(band => band.count > 0), "an empty band was drawn");

fs.rmSync(out, { recursive: true, force: true });
console.log("Search result ordering passed.");
