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

/*
 * Silence is not stock.
 *
 * The product page published schema.org/InStock unconditionally, and the
 * importer filled an empty availability with "Available" — so 1,248 Newegg
 * listings, from a feed carrying no stock field at all, claimed stock on the
 * page and in the markup Google reads.
 */
const refreshSource = read("src", "refresh.js");
assert(
  !/availability: textValue\(product\.availability \|\| "Available"\)/.test(refreshSource),
  "the importer fills an unknown stock state with Available again",
);
/*
 * Where a stock claim is allowed to come from.
 *
 * Not the importer, which knows nothing about any particular shop and used to
 * fill every blank with "Available". A provider may state one, because it
 * knows what its own source returning a row means — Newegg's product search
 * and a merchant's affiliate feed both exist to advertise what can be bought,
 * and both are re-read every refresh. That is a real basis; a blanket fill in
 * the middle of the pipeline was not.
 */
const feedSource = read("src", "providers", "affiliateFeed.js");
assert(
  /Newegg provider states/.test(feedSource),
  "the affiliate feed no longer states the basis for the stock it reports",
);
const neweggSource = read("src", "providers", "rakutenNewegg.js");
assert(
  /tag\(block, "instock"\)/.test(neweggSource),
  "the Newegg feed's own stock field is ignored again",
);
assert(
  !/availability:"",/.test(neweggSource),
  "Newegg leaves stock blank again for the importer to guess at",
);
const dealPageSource = read("app", "[market]", "deal", "[id]", "page.tsx");
assert(
  !/availability: "https:\/\/schema\.org\/InStock"/.test(dealPageSource),
  "every product page claims InStock again, whether or not the shop said so",
);
assert(
  /schemaAvailability\(deal\.availability\)/.test(dealPageSource),
  "the product page no longer derives availability from what the shop actually said",
);
/* "Confirm at retailer" is what the page prints when nobody told us. It must
   not become a claim in the markup. */
const availabilitySource = read("lib", "schemaAvailability.ts");
assert(
  /return undefined;/.test(availabilitySource),
  "an unknown stock state publishes something instead of nothing",
);

/*
 * One spelling per thing, because two spellings is what put 404s in the
 * sitemap.
 *
 * Product URLs are published in two forms — /us/deal/219861 and the readable
 * /us/deal/8bitdo-retro-mechanical-keyboard-219861 — and the route read the
 * whole segment as an id, so all 1,361 product URLs the sitemap advertises
 * answered 404 while the same products answered 200 by number.
 *
 * Categories had two slug rules: Express turned "&" into " and " and produced
 * home-and-kitchen, the pages resolve home-kitchen.
 */
const catalogSource = read("lib", "catalog.ts");
assert(
  /export function dealIdFromParam/.test(catalogSource),
  "the product route reads the whole URL segment as an id again, so slug URLs 404",
);
assert(
  /dealIdFromParam\(id\)/.test(catalogSource),
  "getDeal no longer extracts the id, so the sitemap's URLs stop resolving",
);
assert(
  /export async function resolveCategory/.test(catalogSource),
  "categories are decided by the display file again, so the ones missing from it 404",
);
const serverSourceForSlugs = read("src", "server.js");
assert(
  /const categorySlug = value =>/.test(serverSourceForSlugs),
  "categories share the deal slug rule again, which spells them home-and-kitchen",
);
assert(
  !/`\/category\/\$\{slug\(value\)\}`/.test(serverSourceForSlugs),
  "the sitemap builds category URLs with the deal slug rule again",
);

/*
 * The search box asks the search.
 *
 * The page fetched the whole catalogue and kept rows whose title, brand,
 * category or retailer contained the query as one literal substring, so
 * "wireless earbuds under $50" matched nothing — no product is called that —
 * while /api/search parsed the price out of the phrase and returned
 * seventy-three. The intent parser had been written, tested and running the
 * whole time; it was simply not what the box called.
 */
assert(
  /export async function searchDeals/.test(catalogSource),
  "the search page has no way to reach the backend search again",
);
assert(
  /\/api\/search\?/.test(catalogSource),
  "searchDeals no longer calls the search endpoint",
);
const searchPage = read("app", "[market]", "search", "page.tsx");
assert(
  /searchDeals\(market, filter\)/.test(searchPage),
  "the search page is back to filtering the whole catalogue by substring",
);
/* "Clear all" sat beside chips that included the query, and cleared all but
   that one — the only one the shopper had typed. */
const filterPanel = read("components", "catalog", "FilterPanel.tsx");
assert(
  !/go\(\{ sort: filter\.sort, query: filter\.query \}\)/.test(filterPanel),
  "Clear all keeps the search query again, though it is listed as a filter",
);

/*
 * A dropdown and a slider do not cost a catalogue.
 *
 * getActiveRetailers and getPriceBounds each downloaded the whole market —
 * around seven megabytes — parsed it and reduced it, and DealListing calls
 * both, so it happened twice per render of every search and every category
 * page. The database answers both in one pass.
 */
assert(
  !/getActiveRetailers\([\s\S]{0,120}fetchMarketCatalog/.test(catalogSource),
  "the retailer list downloads the whole catalogue again",
);
assert(
  !/getPriceBounds\([\s\S]{0,120}fetchMarketCatalog/.test(catalogSource),
  "the price slider downloads the whole catalogue again",
);
assert(
  /\/api\/catalog-facets\?market=/.test(catalogSource),
  "the filter panel no longer asks the database for its facets",
);
assert(
  /app\.get\("\/api\/catalog-facets"/.test(appSource),
  "the facets endpoint is gone, so the filter panel has nothing cheap to call",
);

console.log("Catalogue presentation checks passed: numbering, score order, one count, honest stock, one URL per thing, real search, cheap facets.");
