const assert = require("node:assert/strict");
const {feedDefinitions} = require("../src/retailerCatalog");
const {searchProducts} = require("../src/providers/affiliateFeed");

async function main() {
  const ids = ["rowabi", "dima-eyewear", "personalhour", "brookwood-med", "lunzo"];
  // Merely having the publisher key must not activate unaccepted invitations.
  const automatic = feedDefinitions({AWIN_PRODUCT_DATA_KEY:"a".repeat(32)});
  assert(!automatic.some(feed => ids.includes(feed.retailerId)));

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

  const rowabi = feedDefinitions({AFFILIATE_FEED_ROWABI_US_URL:"https://feeds.example/rowabi.csv"})[0];
  await assert.rejects(searchProducts({definition:rowabi, market:{code:"us",currency:"USD"}, fetchImpl}),
    /no usable commissionable products/, "Stale feed rows must not publish as freshly checked Rowabi offers");
  console.log("Awin onboarding: opt-in, German market isolation and stale Rowabi feed guards passed.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
