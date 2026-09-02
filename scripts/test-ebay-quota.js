const assert = require("assert");
const { isQuotaError, keywordsForRun, searchProducts } = require("../src/providers/ebay");

/*
 * eBay sells a fixed number of calls a day, and a refresh spends one per search
 * term plus one per item it examines. Asking for all 48 terms and 220 lookups
 * in each of five markets, on a day with nine sweeps, spent the whole allowance
 * by half past midnight: every market then failed with "The request limit has
 * been reached for the resource", including the four whose only source is eBay.
 *
 * These are the three behaviours that keep that from recurring: take a slice of
 * the list per run, stop the moment the allowance is gone, and stop when the
 * run that asked has stopped waiting.
 */

const market = {
  code:"us",
  currency:"USD",
  locale:"en-US",
  countryCodes:["US"],
  ebayMarketplaceId:"EBAY_US"
};
const campaignId = "5339179772";

const summary = {
  itemId:"v1|123456789012|0",
  title:"Test Product",
  condition:"New",
  conditionId:"1000",
  buyingOptions:["FIXED_PRICE"],
  image:{imageUrl:"https://i.ebayimg.com/images/test.jpg"},
  price:{value:"49.99", currency:"USD"},
  itemAffiliateWebUrl:`https://www.ebay.com/itm/123456789012?campid=${campaignId}`,
  seller:{username:"trusted-seller", feedbackPercentage:"99.8", feedbackScore:12000},
  primaryProductReviewRating:{averageRating:"4.7", reviewCount:321}
};

const credentials = {
  clientId:"production-client-id",
  clientSecret:"production-client-secret",
  campaignId,
  market,
  fetchImpl:async () => {
    throw new Error("The injected client was ignored and a real call went out");
  }
};

const terms = Array.from({length:48}, (_, index) => `term-${index}`);

/* One slice per run, and a different slice as the day moves on. */
const first = keywordsForRun(terms, 16, 0);
const second = keywordsForRun(terms, 16, 3 * 60 * 60 * 1000);
const third = keywordsForRun(terms, 16, 6 * 60 * 60 * 1000);
assert.strictEqual(first.length, 16, "A run no longer takes a slice of the keyword list");
assert.notDeepStrictEqual(first, second, "Every run searches the same slice, so the rest never get a turn");

/* Across the windows the whole list is covered — a category cannot be starved
   for the 48 hours a product survives without being seen again. */
const covered = new Set([...first, ...second, ...third]);
assert.strictEqual(covered.size, terms.length, "Rotating the list leaves some keywords never searched");

/* A run in the same window is the same run: two refreshes minutes apart must
   not each pay for a different slice. */
assert.deepStrictEqual(
  keywordsForRun(terms, 16, 60 * 1000),
  first,
  "Two runs in the same window search different slices, doubling what they cost",
);

/* Short lists are left alone. */
const shortList = ["air fryer", "robot vacuum"];
assert.deepStrictEqual(keywordsForRun(shortList, 16, 0), shortList, "A short keyword list is being rotated");

assert(isQuotaError({status:429}), "An HTTP 429 is no longer read as an exhausted allowance");
assert(
  isQuotaError(new Error("eBay Browse API failed: The request limit has been reached for the resource.")),
  "eBay's own wording for an exhausted allowance is no longer recognised",
);
assert(!isQuotaError(new Error("The operation was aborted due to timeout")), "A timeout is being mistaken for an exhausted allowance");

(async () => {
  /*
   * When the allowance is gone, stop. The run used to ask the remaining 47
   * terms anyway and report the refusal 47 times, then let four more markets
   * do the same.
   */
  let searchCalls = 0;
  const quotaClient = {
    search:async () => {
      searchCalls += 1;
      const error = new Error("eBay Browse API failed: The request limit has been reached for the resource.");
      error.status = 429;
      throw error;
    },
    getItem:async () => {
      throw new Error("Details were fetched after the allowance was already gone");
    }
  };

  await assert.rejects(
    () => searchProducts({...credentials, keywords:terms, rotate:true, client:quotaClient}),
    /no calls left in its daily allowance/,
    "An exhausted allowance is not reported as such",
  );
  /* At most one more per lane in flight when the first refusal lands. */
  assert(
    searchCalls <= 3,
    `The run kept asking after the allowance was gone: ${searchCalls} calls`,
  );

  /*
   * A shopper's own query is never shortened. Rotation belongs to the broad
   * scheduled sweep; dropping two thirds of what someone actually asked for
   * would be a different kind of bug.
   */
  const asked = [];
  const products = await searchProducts({
    ...credentials,
    keywords:terms.slice(0, 20),
    client:{
      search:async (keyword) => {
        asked.push(keyword);
        return [summary];
      },
      getItem:async () => summary
    },
    detailLimit:1,
    targetEligible:1
  });
  assert.strictEqual(asked.length, 20, "A query the caller supplied was rotated and part of it dropped");
  assert.strictEqual(products.length, 1);

  /*
   * When the refresh has stopped waiting, the source stops working. Left
   * running, two abandoned eBay runs spent the allowance the next run needed.
   */
  const controller = new AbortController();
  let detailCalls = 0;
  await assert.rejects(
    () => searchProducts({
      ...credentials,
      keywords:["air fryer"],
      signal:controller.signal,
      client:{
        search:async () => Array.from({length:40}, (_, index) => ({
          ...summary,
          itemId:`v1|10000000000${index}|0`
        })),
        /* Nothing here clears the trust bar, so the only way this run can end
           is by stopping — which is what is being checked. */
        getItem:async () => {
          detailCalls += 1;
          controller.abort();
          return {
            ...summary,
            primaryProductReviewRating:{averageRating:"1", reviewCount:0},
            seller:{username:"unknown-seller", feedbackPercentage:"50", feedbackScore:1}
          };
        }
      },
      detailLimit:40,
      targetEligible:40
    }),
    /no products with sufficient/,
    "An aborted run did not end",
  );
  assert(
    detailCalls <= 10,
    `The run kept fetching details after it was cancelled: ${detailCalls} lookups`,
  );

  console.log("eBay allowance checks passed: rotation, early stop on an exhausted quota, cancellation.");
})();
