const assert = require("assert");
const fs = require("fs");
const path = require("path");

/*
 * Four things a partner reviewing the site found, three of which were ours to
 * fix. Each assertion below names what they saw, so a change that brings it
 * back fails here rather than in somebody else's review.
 */

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

/* ------------------------------------------------- the numbers on the cards */

/*
 * "After positions 1 to 4 come 125 to 137."
 *
 * The badge showed the item's place in the whole catalogue, which on a curated
 * grid of twelve is a meaningless number with holes in it. Beside the fifth
 * card the only sensible reading is "the fifth of these".
 */
const card = read("components", "deal", "DealCard.tsx");
assert(
  /#\{index \+ 1\}/.test(card),
  "the card badge is numbered from something other than its position in the list",
);
assert(
  !/#\{deal\.rank\}/.test(card),
  "the card badge shows a catalogue position again, which jumps from 4 to 125",
);

/* ----------------------------------------------------- best means best */

/*
 * "Number 3 has a score of 90 and number 1 has 88, in a section called
 * highest scoring."
 *
 * The picker walks the catalogue applying a cap per category and per shop,
 * which is what makes the grid a spread rather than twelve of one thing. It
 * just never put the result back in score order.
 */
const catalog = read("lib", "catalog.ts");
assert(
  /picked\.sort\(\(left, right\) => \(right\.score \?\? -1\) - \(left\.score \?\? -1\)\)/.test(catalog),
  "the Best right now grid is no longer sorted by score",
);

/* -------------------------------------------------------- one count, once */

/*
 * "The home page adds up to about 2,631, About says 2,588, For retailers says
 * 2,548."
 *
 * Two sources: the category tiles counted from /api/categories, the prose
 * pages measured the length of /api/products, and those genuinely differ —
 * 2,631 against 2,548 on the day it was checked. Both now read the same one.
 */
assert(
  /async function fetchCategoryCounts\(/.test(catalog),
  "the per-category counts are no longer fetched in one place",
);
const catalogSize = /export async function getCatalogSize\([\s\S]*?\n\}/.exec(catalog);
assert(catalogSize, "getCatalogSize moved out of lib/catalog.ts");
assert(
  /fetchCategoryCounts/.test(catalogSize[0]),
  "the catalogue size is counted from a different source than the category tiles again",
);
assert(
  !/fetchMarketCatalog/.test(catalogSize[0]),
  "the catalogue size is back to measuring the length of the product listing",
);

/* --------------------------------------------------- typos from the feeds */

/*
 * "Persoanlized appears several times. Even if it came from the shop, on
 * OneDailyDrop it looks like our mistake."
 *
 * Corrected on the way to the page, and only for words actually seen in the
 * live feed. A guessed correction eventually mangles a real product name.
 */
const adapter = read("lib", "backendAdapter.ts");
assert(
  /persoanlized: "personalized"/.test(adapter),
  "the misspelling a reviewer found is no longer corrected",
);
assert(
  /title: correctFeedTitle\(raw\.title\)/.test(adapter),
  "titles reach the page without passing the correction",
);
/* Klein Tools writes ImpactRated on purpose. A correction list that grows by
   guesswork would eventually rewrite a real name, so the list itself is
   checked rather than the file: the word appears in the comment explaining
   why it is not corrected. */
const typoList = /const FEED_TITLE_TYPOS[\s\S]*?\n\};/.exec(adapter);
assert(typoList, "the typo list moved out of lib/backendAdapter.ts");
assert(
  !/impactrated/i.test(typoList[0]),
  "a manufacturer's own spelling was added to the typo list",
);
/* Small on purpose. Every entry costs a reading of the live feed to justify. */
assert(
  (typoList[0].match(/^\s+[a-z]+:/gm) || []).length <= 8,
  "the typo list has grown past what anybody has checked against the feed",
);

/*
 * A count on a tile has to count things a shopper can reach.
 *
 * /api/categories answered with COUNT(*) over the table while every list on
 * the site removes repeat listings on the way out, so the tiles promised 1,845
 * where the pages behind them held 1,742 — 104 of the promised listings were
 * the same products counted twice.
 */
const appSource = read("app.js");
const categoriesRoute = /app\.get\("\/api\/categories"[\s\S]*?\n  \}\);/.exec(appSource);
assert(categoriesRoute, "the /api/categories route moved out of app.js");
assert(
  !/COUNT\(\*\) AS count/.test(categoriesRoute[0]),
  "category counts are back to counting table rows, duplicates and all",
);
assert(
  /uniqueProductsInOrder\(/.test(categoriesRoute[0]),
  "category counts no longer go through the deduplication the listings they describe use",
);

/*
 * Both halves of "N listings across M categories" must come from one place.
 * The size was live while the category count was the length of the local
 * display file, so About said 11 where the catalogue held 13.
 */
const about = read("app", "[market]", "about", "page.tsx");
assert(
  !/getCategories\(\)\.length/.test(about),
  "About counts categories from the local display file again, so its two numbers disagree",
);

/*
 * Search has to work before the JavaScript does.
 *
 * The box had no action and its field no name, so a submit before hydration
 * went to the current URL carrying nothing: a reviewer typed "65 inch TV",
 * pressed Search, and landed back on the homepage with an empty box.
 */
const searchBox = read("components", "site", "SearchBox.tsx");
assert(
  /action=\{`\/\$\{market\}\/search`\}/.test(searchBox) && /method="get"/.test(searchBox),
  "the search box no longer reaches the results page without JavaScript",
);
assert(
  /name="q"/.test(searchBox),
  "the search field has no name again, so a plain submit discards the query",
);

console.log("Catalogue presentation checks passed: card numbering, score order, one count, search without JavaScript.");
