const assert = require("node:assert/strict");
const {feedDefinitions} = require("../src/retailerCatalog");
const {searchProducts,allowedByFeedPolicy} = require("../src/providers/affiliateFeed");

async function main() {
  // Only the three joined merchants with confirmed feeds auto-configure.
  const automatic = feedDefinitions({AWIN_PRODUCT_DATA_KEY:"a".repeat(32)});
  for (const [id,fid] of [["dima-eyewear","F4005"],["personalhour","F3280"],["brookwood-med","F2671"]]) {
    const feed = automatic.find(feed => feed.retailerId === id);
    assert(feed);
    assert.deepEqual(feed.markets,["us"]);
    assert(feed.url.endsWith(`/feed/${fid}.csv.gz`));
  }
  assert(!automatic.some(feed => feed.retailerId === "lunzo"));
  const personal = automatic.find(feed => feed.retailerId === "personalhour");
  assert(allowedByFeedPolicy({title:"In Stock Yoga Cork Block"},personal));
  assert(!allowedByFeedPolicy({title:"Reformer [On-Demand] Custom Color"},personal));

  const lunzo = feedDefinitions({AFFILIATE_FEED_LUNZO_DE_URL:"https://feeds.example/lunzo.csv"})[0];
  assert.deepEqual(lunzo.markets, ["de"]);
  assert.equal(lunzo.retailerName, "Lunzo DE");
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return new Response("id,title,price,currency,image_link,aw_deep_link,availability\n" +
      "lamp,Calista Pendant Light,440,USD,https://images.example/lamp.jpg,https://www.awin1.com/pclick.php?p=1,in_stock\n");
  };
  assert.deepEqual(await searchProducts({definition:lunzo, market:{code:"us",currency:"USD"}, fetchImpl}), []);
  assert.equal(requests, 0, "German feed must never be fetched for US shoppers");

  assert(!feedDefinitions({AFFILIATE_FEED_ROWABI_US_URL:"https://feeds.example/rowabi.csv"})
    .some(feed => feed.retailerId === "rowabi"), "Rowabi was excluded by the publisher");
  console.log("Awin onboarding: joined feeds, fulfillment filter, German isolation and Rowabi exclusion passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
