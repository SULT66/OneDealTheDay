const assert = require("assert");
const { candidateIsUsable, hasTrustEvidence, normalizeItem, searchProducts } = require("../src/providers/ebay");

const market = {
  code:"us",
  currency:"USD",
  locale:"en-US",
  countryCodes:["US"],
  ebayMarketplaceId:"EBAY_US"
};
const campaignId = "5339179772";
let oauthCalls = 0;
let searchCalls = 0;
let detailCalls = 0;

const summary = {
  itemId:"v1|123456789012|0",
  legacyItemId:"123456789012",
  epid:"987654321",
  title:"Test Smart Home Product",
  condition:"New",
  conditionId:"1000",
  buyingOptions:["FIXED_PRICE"],
  image:{imageUrl:"https://i.ebayimg.com/images/test.jpg"},
  price:{value:"49.99", currency:"USD"},
  marketingPrice:{originalPrice:{value:"79.99", currency:"USD"}, discountPercentage:"37.5"},
  itemAffiliateWebUrl:`https://www.ebay.com/itm/123456789012?campid=${campaignId}`,
  seller:{username:"trusted-seller", feedbackPercentage:"99.8", feedbackScore:12000},
  topRatedBuyingExperience:true
};

const fetchImpl = async (url, options = {}) => {
  const parsed = new URL(url);
  if (parsed.pathname.endsWith("/identity/v1/oauth2/token")) {
    oauthCalls += 1;
    assert.strictEqual(options.method, "POST");
    assert(String(options.headers.Authorization).startsWith("Basic "));
    return {ok:true, status:200, json:async () => ({access_token:"production-token", expires_in:7200})};
  }

  assert.strictEqual(options.headers.Authorization, "Bearer production-token");
  assert.strictEqual(options.headers["X-EBAY-C-MARKETPLACE-ID"], "EBAY_US");
  assert(options.headers["X-EBAY-C-ENDUSERCTX"].includes(`affiliateCampaignId=${campaignId}`));
  if (parsed.pathname.endsWith("/item_summary/search")) {
    searchCalls += 1;
    assert.strictEqual(parsed.searchParams.get("filter"), "buyingOptions:{FIXED_PRICE},conditions:{NEW},deliveryCountry:US");
    return {
      ok:true,
      status:200,
      json:async () => ({itemSummaries:[summary, {...summary, itemId:"v1|no-affiliate|0", itemAffiliateWebUrl:""}]})
    };
  }

  detailCalls += 1;
  assert(parsed.pathname.includes("v1%7C123456789012%7C0"));
  return {
    ok:true,
    status:200,
    json:async () => ({
      ...summary,
      brand:"Example Brand",
      gtin:"012345678905",
      mpn:"MODEL-100",
      shortDescription:"A verified product description.",
      primaryProductReviewRating:{averageRating:"4.7", reviewCount:321},
      shippingOptions:[{shippingCost:{value:"0.00", currency:"USD"}, shippingServiceCode:"USPS"}],
      returnTerms:{
        returnsAccepted:true,
        returnPeriod:{value:30, unit:"CALENDAR_DAY"},
        returnShippingCostPayer:"SELLER"
      }
    })
  };
};

(async () => {
  assert(candidateIsUsable(summary), "A commissionable new fixed-price item was rejected");
  assert(!candidateIsUsable({...summary, itemAffiliateWebUrl:""}), "A non-affiliate item was accepted");

  const products = await searchProducts({
    clientId:"production-client-id",
    clientSecret:"production-client-secret",
    campaignId,
    keywords:["smart home"],
    market,
    fetchImpl,
    detailLimit:1,
    targetEligible:1
  });
  assert.strictEqual(products.length, 1);
  assert.strictEqual(products[0].source, "ebay");
  assert.strictEqual(products[0].source_rank, 1);
  assert.strictEqual(products[0].rating, 4.7);
  assert.strictEqual(products[0].review_count, 321);
  assert.strictEqual(products[0].affiliate_url, summary.itemAffiliateWebUrl);
  assert.strictEqual(products[0].shipping_summary, "Free shipping via USPS");
  assert.strictEqual(products[0].return_summary, "30 calendar days, seller-paid return shipping");
  assert.strictEqual(products[0].product_key, "gtin:00012345678905");
  assert.strictEqual(oauthCalls, 1, "The OAuth application token was not reused");
  assert.strictEqual(searchCalls, 1);
  assert.strictEqual(detailCalls, 1);

  let reusableSearchCalls = 0;
  let reusableDetailCalls = 0;
  const reusableProducts = await searchProducts({
    clientId:"production-client-id",
    clientSecret:"production-client-secret",
    campaignId,
    keywords:["samsung tv"],
    market,
    client:{
      search:async () => {
        reusableSearchCalls += 1;
        return [summary];
      },
      getItem:async () => {
        reusableDetailCalls += 1;
        return {
          ...summary,
          primaryProductReviewRating:{averageRating:"4.7", reviewCount:321}
        };
      }
    },
    fetchImpl:async () => {
      throw new Error("The reusable assistant client was ignored");
    },
    detailLimit:1,
    targetEligible:1
  });
  assert.strictEqual(reusableProducts.length, 1);
  assert.strictEqual(reusableSearchCalls, 1);
  assert.strictEqual(reusableDetailCalls, 1);

  const noReturns = normalizeItem({
    ...summary,
    primaryProductReviewRating:{averageRating:"4.5", reviewCount:100},
    returnTerms:{returnsAccepted:false}
  }, "home gadgets", 1, market);
  assert.strictEqual(noReturns.return_summary, "Returns not accepted");

  const sellerBacked = normalizeItem({
    ...summary,
    primaryProductReviewRating:undefined
  }, "home gadgets", 2, market);
  assert.strictEqual(sellerBacked.rating, 0, "A seller score was incorrectly exposed as a product rating");
  assert(hasTrustEvidence(sellerBacked), "An established seller was not accepted as fallback evidence");
  assert(!hasTrustEvidence({...sellerBacked, seller_rating:4.7}), "Weak seller evidence was accepted");

  /*
   * Reviewed listings first; the others only fill what is left.
   *
   * eBay is the only source in the catalogue that supplies product reviews at
   * all, and about one eBay item in five has them — so a run that kept
   * whichever items came back first filled the shelves with listings that
   * could never carry a score. Nothing is excluded here: a listing with no
   * reviews has an honest rung of its own. This decides which ones get the
   * space.
   */
  const mixed = Array.from({ length: 6 }, (_, index) => ({
    ...summary,
    itemId: `v1|mix${index}|0`,
    legacyItemId: `mix${index}`,
    itemAffiliateWebUrl: `https://www.ebay.com/itm/mix${index}?campid=${campaignId}`,
  }));
  /* The two with reviews are the last the search returns, so the run has to
     look past the first four to find them. */
  const reviewed = new Set(["mix4", "mix5"]);
  const mixedFetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/identity/v1/oauth2/token")) {
      return { ok: true, status: 200, json: async () => ({ access_token: "production-token", expires_in: 7200 }) };
    }
    if (parsed.pathname.endsWith("/item_summary/search")) {
      return { ok: true, status: 200, json: async () => ({ itemSummaries: mixed }) };
    }
    const id = decodeURIComponent(parsed.pathname.split("/").pop()).split("|")[1];
    const item = mixed.find((entry) => entry.itemId.includes(id));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...item,
        brand: "Example Brand",
        gtin: `01234567890${id.slice(-1)}`,
        mpn: `MODEL-${id}`,
        shortDescription: "A product.",
        ...(reviewed.has(id) ? { primaryProductReviewRating: { averageRating: "4.6", reviewCount: 180 } } : {}),
        shippingOptions: [{ shippingCost: { value: "0.00", currency: "USD" }, shippingServiceCode: "USPS" }],
        returnTerms: { returnsAccepted: true, returnPeriod: { value: 30, unit: "CALENDAR_DAY" }, returnShippingCostPayer: "SELLER" },
      }),
    };
  };
  const runMixed = (targetEligible) => searchProducts({
    clientId: "production-client-id",
    clientSecret: "production-client-secret",
    campaignId,
    keywords: ["smart home"],
    market,
    fetchImpl: mixedFetch,
    detailLimit: 6,
    targetEligible,
  });

  /* Room for three, and the two that can be scored must be among them. */
  const balanced = await runMixed(3);
  assert.strictEqual(balanced.length, 3, "the shelf should still be filled");
  assert.strictEqual(
    balanced.filter((product) => product.review_count >= 5).length,
    2,
    "the reviewed listings were not kept by preference",
  );

  /* And where there is room for two, an unreviewed listing takes neither. */
  const tight = await runMixed(2);
  assert.strictEqual(tight.length, 2);
  assert.ok(
    tight.every((product) => product.review_count >= 5),
    "an unreviewed listing took a slot a scoreable one needed",
  );

  console.log("eBay Browse API validation passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
