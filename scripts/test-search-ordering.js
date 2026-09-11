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

fs.rmSync(out, { recursive: true, force: true });
console.log("Search result ordering passed.");
