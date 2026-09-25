/*
 * Which pages the site offers to a search engine, and what it says about them.
 *
 * Every published listing used to be offered — all of them, including the ones
 * carrying nothing but the shop's own title, photograph and price. Google's
 * spam policy names that exact shape, and the only way to win that argument is
 * not to make the claim. So a page is offered when it carries something of
 * ours: reviews, a comparison fetched by barcode, a drop we measured, or a
 * Score. Plus a price confirmed recently, because a page whose price we could
 * not check has nothing to be right about.
 *
 * The rest of this file guards the two places that answer: the sitemap and the
 * product page's own robots tag, which must agree, and the breadcrumb trail,
 * which the page has drawn since it was built and never published as markup.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { indexEvidence, indexabilityReason, isIndexableProduct } = require("../src/indexability");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

/* A listing as a shop sends it: their words, their picture, their price. */
const bare = { id: 1, title: "Office chair", current_price: 129, review_count: 0, rating: 0, tracked_drop_percent: 0, score: null, display_score: null };

/* Nothing of ours on the page. */
assert.strictEqual(isIndexableProduct(bare), false);
assert.strictEqual(indexabilityReason(bare, { priceIsCurrent: true }), "nothing of ours on the page");

/* Each of the four kinds of evidence is enough on its own. */
assert.strictEqual(isIndexableProduct({ ...bare, review_count: 42, rating: 4.6 }), true);
assert.strictEqual(isIndexableProduct(bare, { comparable: { price: 119 } }), true);
assert.strictEqual(isIndexableProduct({ ...bare, tracked_drop_percent: 18 }), true);
assert.strictEqual(isIndexableProduct({ ...bare, score: 71 }), true);

/* A review count without a rating is a number with nothing behind it — only
   eBay sends reviews at all, and a shop that sends one sends both. */
assert.strictEqual(isIndexableProduct({ ...bare, review_count: 42, rating: 0 }), false);
assert.strictEqual(isIndexableProduct({ ...bare, review_count: 0, rating: 4.6 }), false);

/* A stale price overrides everything else: the page may be full of our work
   and still be quoting a figure we could not confirm today. */
assert.strictEqual(isIndexableProduct({ ...bare, score: 71, review_count: 42, rating: 4.6 }, { priceIsCurrent: false }), false);
assert.strictEqual(indexabilityReason({ ...bare, score: 71 }, { priceIsCurrent: false }), "price not confirmed recently");

/* The reason names what is actually there, for the admin console. */
assert.strictEqual(
  indexabilityReason({ ...bare, review_count: 42, rating: 4.6, tracked_drop_percent: 18 }, { priceIsCurrent: true }),
  "reviews, trackedDrop",
);

const evidence = indexEvidence({ ...bare, score: 71 }, { comparable: null });
assert.deepStrictEqual(evidence, { reviews: false, comparable: false, trackedDrop: false, score: true });

/* The sitemap offers the same set, and from the same clock. */
const server = read("src/server.js");
assert.ok(server.includes('require("./indexability")'), "server does not use the shared rule");
assert.ok(
  /const productIsIndexable = product => isIndexableProduct\(product, \{[\s\S]*?product_comparables[\s\S]*?staleOfferHours[\s\S]*?\}\);/.test(server),
  "the page-level answer must consider both a comparison and the age of the price",
);
assert.ok(server.includes(".filter(productIsIndexable)"), "the sitemap still offers every published page");
assert.ok(/^\s*indexable,\s*$/m.test(server) && server.includes("index_evidence:indexEvidence("), "the product payload must carry the verdict and its reasons");

/* And the page itself says so, for a crawler that arrives by link rather than
   through the sitemap. Follow stays on: the links out of the page are still
   worth walking. */
const page = read("app/[market]/deal/[id]/page.tsx");
assert.ok(
  page.includes("...(deal.indexable ? {} : { robots: { index: false, follow: true } })"),
  "a page with nothing of ours must not ask to be ranked",
);

/* The trail, published rather than only drawn. */
assert.ok(page.includes('"@type": "BreadcrumbList"'), "the breadcrumb trail is still missing from the markup");
assert.ok(
  page.includes('JSON.stringify({ "@context": "https://schema.org", "@graph": [jsonLd, breadcrumbs] })'),
  "the breadcrumbs must ship in the same graph as the product",
);
/* Three steps, in the order the page draws them. */
for (const position of [1, 2, 3]) {
  assert.ok(page.includes(`position: ${position}`), `breadcrumb step ${position} is missing`);
}

/* The flag has to survive the trip from Express to the page. */
const catalog = read("lib/catalog.ts");
assert.ok(catalog.includes("const indexable = payload.indexable === true;"), "the frontend must not assume a page is indexable");
assert.ok(read("lib/types.ts").includes("indexable: boolean;"), "the deal type does not carry the verdict");
/* A card has no payload of its own, so it must default to the safe answer. */
assert.ok(read("lib/backendAdapter.ts").includes("indexable: false,"), "a product adapted without its own payload must not claim to be indexable");

console.log("indexability: ok");
