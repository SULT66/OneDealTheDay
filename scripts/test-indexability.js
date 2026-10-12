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
/*
 * A published Score, not the number every row carries.
 *
 * Measured on production on 2026-10-09: a bare eBay listing with no reviews,
 * no comparison and no measured drop came back indexable because its internal
 * score was 40 — a number every published listing has. The gate passed all
 * 2,770 of them and kept nothing out of Google, which is the opposite of what
 * it exists for. The question the product page asks before it dares print a
 * Score is the one that belongs here too.
 */
assert.strictEqual(isIndexableProduct({ ...bare, score: 71 }), false, "an internal ranking number is not a Score we publish");
assert.strictEqual(isIndexableProduct({ ...bare, display_score: 71 }), true);

/* A review count without a rating is a number with nothing behind it — only
   eBay sends reviews at all, and a shop that sends one sends both. */
assert.strictEqual(isIndexableProduct({ ...bare, review_count: 42, rating: 0 }), false);
assert.strictEqual(isIndexableProduct({ ...bare, review_count: 0, rating: 4.6 }), false);

/* A stale price overrides everything else: the page may be full of our work
   and still be quoting a figure we could not confirm today. */
assert.strictEqual(isIndexableProduct({ ...bare, display_score: 71, review_count: 42, rating: 4.6 }, { priceIsCurrent: false }), false);
assert.strictEqual(indexabilityReason({ ...bare, display_score: 71 }, { priceIsCurrent: false }), "price not confirmed recently");

/* The reason names what is actually there, for the admin console. */
assert.strictEqual(
  indexabilityReason({ ...bare, review_count: 42, rating: 4.6, tracked_drop_percent: 18 }, { priceIsCurrent: true }),
  "reviews, trackedDrop",
);

const evidence = indexEvidence({ ...bare, display_score: 71 }, { comparable: null });
assert.deepStrictEqual(evidence, { reviews: false, comparable: false, trackedDrop: false, score: true });

/*
 * A row as the database hands it over, with no display_score on it at all.
 *
 * This is the case the fix above missed, and it is the one that actually runs:
 * the product API and the sitemap both pass the stored row, which has a
 * ranking score column and no display_score key. The gate answered that by
 * asking the editorial floor itself — with the wrong inputs, handing it the
 * stored ranking number where a freshly computed one belongs and omitting the
 * evidence confidence, so it said yes. Measured on production on 2026-10-12,
 * after the first fix shipped: /us/deal/balancefrom-gocloud-...-225983 printed
 * no Score, carried no reviews, no comparison and no measured drop, and came
 * back {"score":true} and indexable, with no robots tag on the page.
 *
 * So the two have to be one computation, and this is the assertion that says
 * so: whatever the page prints, the gate reports, for the same row.
 */
{
  const { presentProduct, publishedScore } = require("../src/productPresentation");
  const fresh = new Date().toISOString();
  const row = {
    id: 225983, market: "us", source: "ebay", retailer_name: "eBay",
    title: 'BalanceFrom GoCloud 1" Extra Thick Exercise Yoga Mat with Carrying Strap, Gray',
    brand: "Balancefrom Fitness", category: "Sports & Outdoors", normalized_category: "sports-outdoors",
    /* Both required before a listing is eligible for anything at all, and both
       stripped by the compact API — which is why a fixture built from what the
       API returns does not reproduce this. */
    image_url: "https://i.ebayimg.com/images/g/YeoAAeSwc65pXsbZ/s-l1600.jpg",
    affiliate_url: "https://www.ebay.com/itm/000000000000",
    /* A genuinely strong offer: 78% under the reference price, free delivery,
       returns paid by the seller, a seller with two million feedbacks. This is
       what made it clear the drop's eligibility floor. */
    current_price: 30.99, original_price: 139.99, currency: "USD", checked_at: fresh,
    shipping_summary: "Free delivery via Standard Shipping",
    return_summary: "Returns accepted within 30 days; return shipping paid by seller",
    availability: "In stock",
    seller_name: "spreetail", seller_rating: 4.985, seller_feedback_count: 2365838,
    /* And what it does not carry: eBay published no product rating, so there is
       not enough evidence behind a number to print one. */
    rating: 0, review_count: 0, tracked_drop_percent: 0, tracked_low: 29.99,
    /* The ranking number every published row carries. No display_score: the
       database does not store one. */
    score: 40,
  };
  assert.strictEqual("display_score" in row, false, "the fixture must be the row, not a presented product");
  assert.strictEqual(presentProduct(row, "en").display_score, null, "this listing publishes no Score");
  assert.strictEqual(
    indexEvidence(row, { priceIsCurrent: true }).score,
    false,
    "a page that prints no Score must not be described as having one",
  );
  assert.strictEqual(isIndexableProduct(row, { priceIsCurrent: true }), false);
  assert.strictEqual(indexabilityReason(row, { priceIsCurrent: true }), "nothing of ours on the page");

  /* Stated the other way round, against the page itself, so this keeps holding
     when the floor moves: the gate's answer is the page's answer. */
  for (const candidate of [
    row,
    { ...row, rating: 4.7, review_count: 3100, original_price: 49.99, shipping_summary: "Free shipping", return_summary: "30-day returns", availability: "In stock", seller_feedback_percent: 99.4, seller_feedback_count: 48000 },
    { ...row, current_price: 0 },
  ]) {
    assert.strictEqual(
      indexEvidence(candidate, { priceIsCurrent: true }).score,
      presentProduct(candidate, "en").display_score != null,
      "the gate and the product page must answer the Score question identically",
    );
  }

  /* One function, called by both, rather than two that agree today. */
  assert.strictEqual(typeof publishedScore, "function", "the Score decision is no longer exported");
  assert.ok(
    read("src/indexability.js").includes('require("./productPresentation")'),
    "the gate has gone back to computing the Score itself",
  );
  assert.ok(
    !/isDailyPickEligible/.test(read("src/indexability.js")),
    "the gate must not reach past publishedScore to the floor it is built on",
  );
  assert.ok(
    read("src/productPresentation.js").includes("const dealScore = publishedScore(product, { priceIsCurrent });"),
    "the product page must get its Score from the shared function too",
  );
}

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
