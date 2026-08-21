const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parseSearchOptions,
  searchCatalogProducts
} = require("../src/catalogSearch");

const product = (id, overrides = {}) => ({
  id,
  external_id:`offer-${id}`,
  provider_external_id:`offer-${id}`,
  market:"us",
  product_key:`product-${id}`,
  title:`Useful product ${id}`,
  description:"A useful catalog product",
  brand:"Example",
  category:"Home gadgets",
  normalized_category:"Home gadgets",
  image_url:`https://images.example.com/${id}.jpg`,
  affiliate_url:`https://merchant.example.com/${id}`,
  retailer_name:"eBay",
  source:"ebay",
  availability:"In stock",
  shipping_summary:"Free shipping",
  return_summary:"30-day returns",
  current_price:100 + id,
  currency:"USD",
  rating:4.6,
  review_count:250,
  seller_name:"Example seller",
  seller_rating:4.9,
  seller_feedback_count:1000,
  status:"published",
  updated_at:`2026-08-${String(8 + id).padStart(2, "0")}T12:00:00.000Z`,
  ...overrides
});

const rows = [
  product(1, {product_key:"chair-one", gtin:"00012345678905", title:"Ergonomic office chair", current_price:120}),
  product(2, {product_key:"chair-one", gtin:"00012345678905", title:"Ergonomic office chair", current_price:110, retailer_name:"Tribesigns", source:"feed-tribesigns"}),
  product(3, {title:"Standing office desk", current_price:300, retailer_name:"Tribesigns", source:"feed-tribesigns"}),
  product(4, {title:"Medium firm queen mattress", category:"Mattresses", normalized_category:"Mattresses", current_price:650, retailer_name:"King Koil", source:"feed-king-koil"}),
  product(5, {title:"Personalized family gift", category:"Gifts", normalized_category:"Gifts", current_price:30, retailer_name:"Giftlab", source:"feed-giftlab"}),
  product(6, {title:"Electric folding bicycle", category:"Bicycles", normalized_category:"Bicycles", current_price:500, retailer_name:"Mooncool", source:"feed-mooncool", availability:"Available"})
];

const defaults = parseSearchOptions({});
assert.strictEqual(defaults.page, 1);
assert.strictEqual(defaults.limit, DEFAULT_PAGE_SIZE);
assert.strictEqual(defaults.sort, "best_match");
assert.strictEqual(parseSearchOptions({limit:1000}).limit, MAX_PAGE_SIZE);
assert.throws(() => parseSearchOptions({min_price:200, max_price:100}), /cannot be greater/);
assert.throws(() => parseSearchOptions({sort:"random"}), /sort must be one of/);
assert.throws(() => parseSearchOptions({availability:"sold_out"}), /availability must be one of/);
assert.throws(() => parseSearchOptions({updated_after:"not-a-date"}), /valid ISO date/);

const mattress = searchCatalogProducts(rows, parseSearchOptions({q:"queen mattress"}));
assert.strictEqual(mattress.pagination.total, 1, "Query relevance did not exclude unrelated products");
assert.strictEqual(mattress.products[0].retailer_name, "King Koil");

const budget = searchCatalogProducts(rows, parseSearchOptions({max_price:100}));
assert.deepStrictEqual(budget.products.map(item => item.retailer_name), ["Giftlab"], "Maximum price was not a hard constraint");

const merchant = searchCatalogProducts(rows, parseSearchOptions({merchant:"eBay"}));
assert.strictEqual(merchant.pagination.total, 1, "Merchant filter leaked another retailer");
assert.strictEqual(merchant.products[0].source, "ebay");

const categories = searchCatalogProducts(rows, parseSearchOptions({category:"Home gadgets,Gifts", sort:"price_asc"}));
assert.deepStrictEqual(categories.products.map(item => item.current_price), [30, 110, 300], "Category filter, deduplication, or ascending price sort is unstable");

const paged = searchCatalogProducts(rows, parseSearchOptions({sort:"price_asc", page:2, limit:2}));
assert.deepStrictEqual(paged.products.map(item => item.current_price), [300, 500]);
assert.deepStrictEqual(paged.pagination, {page:2, limit:2, total:5, total_pages:3, has_previous:true, has_next:true});

const newest = searchCatalogProducts(rows, parseSearchOptions({sort:"newest", limit:2}));
assert.deepStrictEqual(newest.products.map(item => item.id), [6, 5], "Newest sort is not deterministic");

const after = searchCatalogProducts(rows, parseSearchOptions({updated_after:"2026-08-13T00:00:00.000Z"}));
assert.deepStrictEqual(after.products.map(item => item.id).sort((a, b) => a - b), [5, 6]);

const repeatA = searchCatalogProducts(rows, parseSearchOptions({q:"office", sort:"best_match"}));
const repeatB = searchCatalogProducts([...rows].reverse(), parseSearchOptions({q:"office", sort:"best_match"}));
assert.deepStrictEqual(repeatA.products.map(item => item.id), repeatB.products.map(item => item.id), "Identical search inputs produced order-dependent results");
assert(repeatA.facets.merchants.some(item => item.value === "Tribesigns" && item.count === 2), "Merchant facets are missing deterministic counts");

const availabilityRows = [...rows, product(7, {title:"Unavailable product", availability:"Out of stock"})];
const availableOnly = searchCatalogProducts(availabilityRows, parseSearchOptions({availability:"available"}));
assert(!availableOnly.products.some(item => item.id === 7), "Default availability leaked an explicitly unavailable offer");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const workflowSource = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "production-verify.yml"), "utf8");
const deploySource = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "deploy-azure.yml"), "utf8");
const releaseSource = fs.readFileSync(path.join(__dirname, "..", "src", "release.js"), "utf8");
assert(appSource.includes('app.get("/api/search"'), "The public Search API route is not registered");
assert(appSource.includes("pagination:result.pagination") && appSource.includes("facets:result.facets"), "The Search API contract is missing pagination or facets");
assert(appSource.includes("X-Robots-Tag") && appSource.includes("noindex, nofollow"), "Search API responses are not protected from indexing");
// The point of this assertion is that the verification must compare against
// the release actually shipped, not a value living in the repository. Reading
// src/release.js used to satisfy that; it stopped doing so once RELEASE_ID
// became a hand-edited constant nobody bumped, so the check matched whatever
// Azure happened to be serving. The deploy now stamps the commit into the
// package and the verification compares against that commit instead.
assert(workflowSource.includes('expected_release="${GITHUB_SHA}"'), "Production verification is pinned to a stale release string instead of the deployed commit");
assert(deploySource.includes('echo "${GITHUB_SHA}" > .release-sha'), "The deploy does not stamp the commit it shipped, so a stale package cannot be detected");
assert(releaseSource.includes(".release-sha"), "src/release.js ignores the stamp written by the deploy");
assert(serverSource.includes("data-results-ui=\"facets-sorting-badges-v1\""), "Day 10 results UI marker is missing");
assert(serverSource.includes("searchCatalogProducts(rows, options)"), "Results UI does not share the deterministic Search API engine");
assert(serverSource.includes("data-results-filters") && serverSource.includes("search-badge-match"), "Facets or transparent result badges are missing");
// The Next.js frontend (app/[market]/search) renders results itself from
// /api/products rather than calling /api/search or the old server-rendered
// results markup above — those two stay live legacy code (still asserted
// on serverSource just above) but production-verify.yml now smoke-tests
// the page visitors actually get, /us/search, instead.
assert(workflowSource.includes("/us/search?q=desk"), "Production verification does not exercise the search results page");

/* Express decides which paths belong to the Next.js app: anything not matching
   nextOwnedPath has its market prefix stripped and is then looked up among the
   Express routes, where a Next-only page does not exist. Adding a page under
   app/[market] without adding it to that list therefore ships a live 404 —
   which is exactly what /us/daily-drop did between merging it and noticing.
   This walks the route directory so the next page cannot repeat it. */
const declaredNextOwned = /const nextOwnedPath = \/(.+)\/;/.exec(serverSource);
assert(declaredNextOwned, "nextOwnedPath is no longer declared where this test looks for it");
const nextOwnedPath = new RegExp(declaredNextOwned[1]);
const marketRoutes = fs
  .readdirSync(path.join(__dirname, "..", "app", "[market]"), { withFileTypes: true })
  .filter(entry => entry.isDirectory());
assert(marketRoutes.length > 0, "No routes found under app/[market]");
for (const route of marketRoutes) {
  const children = fs.readdirSync(path.join(__dirname, "..", "app", "[market]", route.name));
  /* A route with a dynamic child (deal/[id]) is only ever requested with that
     segment filled in, so probe it the way a visitor would reach it. */
  const probe = children.some(name => name.startsWith("["))
    ? `/${route.name}/sample`
    : `/${route.name}`;
  assert(
    nextOwnedPath.test(probe),
    `Express does not hand ${probe} to the Next.js app, so /us${probe} would 404`
  );
}

/* A Next-owned page keeps its market prefix on req.url — the rewriting
   middleware returns early for those and never sets req.market — so the market
   has to be recovered from the path before the language is resolved.
 *
 * That pattern was anchored with `$` and so matched only a bare `/de`. Every
 * deeper page on a non-English market (/de/contact, /fr/search, /de/deal/...)
 * missed it, fell through to the IP lookup and rendered in English with
 * lang="en-US" on it. Nothing 404'd and nothing threw — the pages were simply
 * in the wrong language, which is why it survived every round of checking that
 * only ever opened the market's front page. */
assert(
  /const pathMarket[^]*?\$\{marketCodes\.join\("\|"\)\}\)\(\?=\/\|\$\)/.test(serverSource),
  "The market prefix must be recovered with a `(?=/|$)` lookahead rather than anchored to the " +
  "end of the path — anchoring renders every page below /<market>/ in the wrong language"
);

/* Proved against the pattern itself, not only against the source text. */
const marketPrefix = new RegExp(`^/(${["us", "ca", "uk", "fr", "de"].join("|")})(?=/|$)`);
for (const [url, expected] of [
  ["/de", "de"],
  ["/de/archive", "de"],
  ["/de/contact", "de"],
  ["/fr/deal/123", "fr"],
  ["/de/archive?lang=en", "de"],
  ["/search", ""],
  ["/deal/123", ""],
  ["/design/anything", ""],
]) {
  const found = (url.split("?")[0].match(marketPrefix) || [])[1] || "";
  assert.strictEqual(found, expected, `market recovered from ${url}`);
}

console.log("Day 8 Search API and Day 10 result constraints passed.");
