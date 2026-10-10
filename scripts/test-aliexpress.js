/*
 * AliExpress, and the leash it is kept on.
 *
 * Two things are being guarded. The first is the protocol: this gateway
 * answers a wrong signature with a 200 and a message about something else, so
 * the signing rules are pinned here rather than discovered again at three in
 * the morning.
 *
 * The second is editorial. This is the one source that will never turn us
 * down, which means every filter that keeps the catalogue honest has to live
 * on our side: delivery in days rather than weeks, a seller with a record, and
 * a listing somebody has actually bought. And one thing that is not a filter
 * at all but matters as much — what this source cannot tell us is left empty
 * rather than filled in with something plausible.
 *
 * See src/providers/aliexpress.js.
 */
const assert = require("assert");
const crypto = require("crypto");

const {
  GATEWAY,
  isAcceptable,
  keywordsForRun,
  normalizeItem,
  productsFrom,
  searchProducts,
  signParams,
} = require("../src/providers/aliexpress");
const { isIndexableProduct } = require("../src/indexability");
const { planGapSearches, SHELVES } = require("../src/aliexpressGaps");
const { canonicalCategory } = require("../src/catalogTaxonomy");

const categoryRows = Object.keys(SHELVES).map(category => ({ category, count: 150 }));
const setCount = (category, count) => categoryRows.find(row => row.category === category).count = count;
setCount("Baby & Kids", 12);
setCount("Bikes & Mobility", 22);
setCount("Fashion", 25);
setCount("Automotive", 33);
setCount("Furniture", 35);
setCount("Pet Supplies", 42);
const gapPlan = planGapSearches(categoryRows, { now: 0 });
assert.deepStrictEqual(gapPlan.map(row => row.category), ["Baby & Kids", "Bikes & Mobility", "Fashion", "Automotive", "Furniture", "Pet Supplies"]);
assert(!gapPlan.some(row => row.category === "Electronics"), "a full shelf must not compete with a gap");
assert.notStrictEqual(planGapSearches(categoryRows, { now: 3 * 3600 * 1000 })[0].keyword, gapPlan[0].keyword);
assert.deepStrictEqual(planGapSearches(categoryRows.map(row => ({...row, count:100}))), []);
for (const [category, keywords] of Object.entries(SHELVES)) {
  for (const title of keywords) assert.strictEqual(canonicalCategory({title, category}), category);
}

const SECRET = "test-secret";

/* ------------------------------------------------------------ the signature */

/* Sorted, concatenated key then value, no separators, HMAC-SHA256, upper case.
   Recomputed here independently of the implementation. */
const params = { method: "aliexpress.affiliate.product.query", app_key: "key", timestamp: 1700000000000, keywords: "office chair" };
const expected = crypto.createHmac("sha256", SECRET)
  .update("app_keykeykeywordsoffice chairmethodaliexpress.affiliate.product.querytimestamp1700000000000", "utf8")
  .digest("hex").toUpperCase();
assert.strictEqual(signParams(params, SECRET), expected, "the string being signed is not what the gateway expects");

/* The signature is never part of what is signed. */
assert.strictEqual(signParams({ ...params, sign: "SHOULD BE IGNORED" }, SECRET), expected);
/* Empty values are left out rather than signed as empty. */
assert.strictEqual(signParams({ ...params, keyword_hint: "" }, SECRET), expected);
/* Order of the object does not change the signature. */
assert.strictEqual(
  signParams({ timestamp: 1700000000000, keywords: "office chair", app_key: "key", method: params.method }, SECRET),
  expected,
);
assert.notStrictEqual(signParams(params, "another-secret"), expected, "the secret is not actually used");

/* -------------------------------------------------------------- the request */

const listing = (overrides = {}) => ({
  product_id: 1005001,
  product_title: "Ergonomic mesh office chair",
  target_sale_price: "119.99",
  target_original_price: "179.99",
  target_sale_price_currency: "USD",
  product_main_image_url: "https://ae01.alicdn.com/kf/chair.jpg",
  promotion_link: "https://s.click.aliexpress.com/e/_tracked",
  shop_url: "https://www.aliexpress.com/store/1",
  shop_id: 42,
  evaluate_rate: "97.4%",
  lastest_volume: 2400,
  ship_to_days: "7",
  second_level_category_name: "Office Furniture",
  ...overrides,
});

const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  return {
    ok: true,
    json: async () => ({
      aliexpress_affiliate_product_query_response: {
        resp_result: { result: { products: { product: [listing(), listing({ product_id: 1005002, evaluate_rate: "80.0%" })] } } },
      },
    }),
  };
};

(async () => {
  const gapCalls = [];
  const gapProducts = await searchProducts({
    appKey: "key", appSecret: SECRET, trackingId: "onedailydrop",
    keywords: ["fashion scarf", "dog leash"], rotate: false,
    keywordCategories: {"fashion scarf":"Fashion", "dog leash":"Pet Supplies"},
    maxProducts: 4, maxProductsPerKeyword: 2,
    fetchImpl: async url => {
      const keyword = new URL(url).searchParams.get("keywords");
      gapCalls.push(keyword);
      return {ok:true, json:async () => ({resp_result:{result:{products:{product:[
        listing({product_id:`${keyword}-wrong`, product_title:"USB Hub Laptop Adapter"}),
        listing({product_id:`${keyword}-unknown`, product_title:"Unidentified promotional item"}),
        ...Array.from({length:5}, (_, index) => listing({product_id:`${keyword}-${index}`, product_title:keyword}))
      ]}}}})};
    }
  });
  assert.deepStrictEqual(gapCalls, ["fashion scarf", "dog leash"]);
  assert.strictEqual(gapProducts.length, 4, "one keyword must not consume the entire import cap");
  assert.strictEqual(gapProducts.filter(product => product.category === "Fashion").length, 2);
  assert.strictEqual(gapProducts.filter(product => product.category === "Pet Supplies").length, 2);
  assert(!gapProducts.some(product => product.title.includes("USB")), "irrelevant API results must not fill a gap");
  assert(!gapProducts.some(product => product.title.includes("Unidentified")), "unknown products must not inherit the search shelf");
  const found = await searchProducts({
    appKey: "key",
    appSecret: SECRET,
    trackingId: "onedailydrop",
    keywords: ["office chair"],
    market: { code: "us", currency: "USD" },
    fetchImpl: fakeFetch,
  });

  assert.strictEqual(calls.length, 1, "one keyword should be one call");
  const url = new URL(calls[0]);
  assert.strictEqual(`${url.origin}${url.pathname}`, GATEWAY);
  const sent = Object.fromEntries(url.searchParams.entries());
  assert.strictEqual(sent.method, "aliexpress.affiliate.product.query");
  assert.strictEqual(sent.sign_method, "sha256");
  assert.strictEqual(sent.app_key, "key");
  assert.strictEqual(sent.tracking_id, "onedailydrop", "without a tracking id the clicks earn nothing");
  assert.strictEqual(sent.ship_to_country, "US");
  assert.strictEqual(sent.target_currency, "USD");
  assert.strictEqual(sent.delivery_days, "10", "the delivery ceiling must be asked for at the source too");
  assert.ok(Number(sent.page_size) <= 50, "the gateway rejects a page larger than fifty");
  /* And the signature that was sent is the signature of what was sent. */
  const { sign, ...signed } = sent;
  assert.strictEqual(sign, signParams(signed, SECRET), "the request was signed over different parameters than it carried");

  /* The second listing, from an 80% seller, was dropped. */
  assert.strictEqual(found.length, 1, "a seller below the floor reached the catalogue");
  const product = found[0];

  /* -------------------------------------------------------- what we publish */

  assert.strictEqual(product.external_id, "1005001");
  assert.strictEqual(product.current_price, 119.99);
  assert.strictEqual(product.original_price, 179.99);
  assert.strictEqual(product.currency, "USD");
  assert.strictEqual(product.source, "aliexpress");
  assert.strictEqual(product.retailer_name, "AliExpress");
  assert.strictEqual(product.affiliate_url, "https://s.click.aliexpress.com/e/_tracked");
  assert.ok(product.affiliate_url.includes("s.click.aliexpress.com"), "the plain product link earns nothing");
  assert.strictEqual(product.seller_rating, 4.87, "positive feedback was not carried onto the five point scale");

  /* What this source cannot tell us is left empty, not guessed. A product
     review score invented from a seller's feedback would be a number on the
     page with nothing behind it. */
  assert.strictEqual(product.rating, 0);
  assert.strictEqual(product.review_count, 0);
  assert.strictEqual(product.gtin, "");
  assert.strictEqual(product.product_key, "");
  assert.strictEqual(product.seller_feedback_count, 0);

  /* Which has a consequence worth stating out loud: a listing like this is
     published, searchable and recommendable, and is not offered to Google
     until it earns it another way. See src/indexability.js. */
  assert.strictEqual(
    isIndexableProduct({ ...product, score: null, display_score: null, tracked_drop_percent: 0 }, { comparable: null }),
    false,
    "a listing with none of our own evidence was offered for ranking",
  );

  /* ------------------------------------------------------------- the leash */

  const leash = { minSellerPercent: 94, minOrders: 100, maxDeliveryDays: 10 };
  assert.ok(isAcceptable(listing(), leash));
  assert.ok(!isAcceptable(listing({ evaluate_rate: "93.9%" }), leash), "a seller below the floor was accepted");
  assert.ok(!isAcceptable(listing({ lastest_volume: 12 }), leash), "a listing nobody has bought was accepted");
  assert.ok(!isAcceptable(listing({ ship_to_days: "25" }), leash), "a month of shipping was accepted");
  assert.ok(!isAcceptable(listing({ ship_to_days: "" }), leash), "an unknown delivery time is not a fast one");
  assert.ok(!isAcceptable(listing({ promotion_link: "" }), leash), "a listing with no tracked link was accepted");
  assert.ok(!isAcceptable(listing({ target_sale_price: "0" }), leash), "a listing with no price was accepted");

  /* ------------------------------------------------------- failure and halt */

  await assert.rejects(
    searchProducts({
      appKey: "key", appSecret: SECRET, trackingId: "t", keywords: ["chair"],
      fetchImpl: async () => ({ ok: true, json: async () => ({ error_response: { code: 15, msg: "Remote service error" } }) }),
    }),
    /Remote service error/,
    "the gateway reports failure inside a 200 and that must still be an error",
  );

  await assert.rejects(
    searchProducts({ appKey: "", appSecret: "", trackingId: "", keywords: ["chair"], fetchImpl: fakeFetch }),
    /not configured/,
  );

  /* A refresh gives every source a deadline; a source that ignores it holds
     the whole catalogue up. */
  const controller = new AbortController();
  controller.abort();
  const halted = await searchProducts({
    appKey: "key", appSecret: SECRET, trackingId: "t",
    keywords: ["chair", "desk"], fetchImpl: fakeFetch, signal: controller.signal,
  });
  assert.deepStrictEqual(halted, [], "an aborted sweep kept working");

  /* ------------------------------------------------- it cannot hold the run */

  /*
   * A connection that is accepted and then goes quiet.
   *
   * On 2026-10-09 this source sat on the catalogue refresh for its entire
   * thirty-minute budget and the run ended with every source reporting
   * failure and nothing imported. Aborting a request only works if the other
   * end honours the signal; when it does not, the await never returns and no
   * budget helps. So the sweep races its own clock and settles either way.
   */
  const silent = () => new Promise(() => {});
  const startedAt = Date.now();
  await assert.rejects(
    searchProducts({
      appKey: "key", appSecret: SECRET, trackingId: "t",
      keywords: ["a", "b", "c", "d", "e", "f"],
      fetchImpl: silent, budgetMs: 3000, timeoutMs: 800,
    }),
    /did not answer/,
    "a source that never answers must still end its own sweep",
  );
  assert.ok(Date.now() - startedAt < 15000, "the sweep outlived its own budget");

  /* And one bad keyword is one bad keyword, not a lost sweep. */
  let attempts = 0;
  const flaky = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("boom");
    return { ok: true, json: async () => ({
      aliexpress_affiliate_product_query_response: {
        resp_result: { result: { products: { product: [listing({ product_id: 2000 + attempts })] } } },
      },
    }) };
  };
  const survived = await searchProducts({
    appKey: "key", appSecret: SECRET, trackingId: "t",
    keywords: ["a", "b", "c", "d", "e", "f"], fetchImpl: flaky,
  });
  assert.strictEqual(survived.length, 5, "one failing keyword threw away the five that worked");

  /* ---------------------------------------------------------- the rotation */

  const terms = ["a", "b", "c", "d", "e", "f", "g", "h"];
  /* A fixed clock: the slice a run takes depends on the hour, and the last
     slice of an uneven list is short by design. */
  assert.deepStrictEqual(keywordsForRun(terms, { perRun: 3, now: 0 }), ["a", "b", "c"]);
  for (let hours = 0; hours < 48; hours += 3) {
    const slice = keywordsForRun(terms, { perRun: 3, now: hours * 3600 * 1000 });
    assert.ok(slice.length >= 1 && slice.length <= 3, "one run must not spend the whole list");
  }
  assert.deepStrictEqual(keywordsForRun(terms, { rotate: false }), terms);
  const slices = new Set();
  for (let hours = 0; hours < 24; hours += 3) {
    slices.add(keywordsForRun(terms, { perRun: 3, now: hours * 3600 * 1000 }).join(","));
  }
  assert.ok(slices.size > 1, "the rotation never rotates");

  /* The response has been seen nested two different ways in the wild. */
  assert.strictEqual(productsFrom({ resp_result: { result: { products: { product: [listing()] } } } }).length, 1);
  assert.deepStrictEqual(productsFrom({}), []);
  assert.deepStrictEqual(productsFrom(null), []);

  /* And the shape the rest of the pipeline reads. */
  const bare = normalizeItem(listing({ target_original_price: "100", target_sale_price: "119.99" }), "office chair", 1, { code: "us", currency: "USD" });
  assert.strictEqual(bare.original_price, null, "a list price below the sale price is not a saving");
  assert.strictEqual(bare.category, "office chair");
  assert.strictEqual(bare.availability, "In stock");
  assert.ok(bare.description.includes("bought recently"), "the one piece of evidence this source gives was dropped");

  console.log("aliexpress: ok");
})();
