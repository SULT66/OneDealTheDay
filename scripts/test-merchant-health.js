const assert = require("node:assert/strict");
const {coverage, feedDefinitions} = require("../src/retailerCatalog");

// Native APIs, Awin product feeds and mere store-directory entries are not
// interchangeable. A merchant with an approved link is not necessarily
// importing any products, and one configured provider must not create two
// rows for the same merchant in the admin health list.
const providers = [
  {id:"ebay", source:"ebay", markets:["us"]},
  {id:"walmart", source:"walmart", markets:["us"]},
  {id:"feed-outin-us", source:"feed-outin", markets:["us"]},
];
const rows = coverage(providers);
const byId = id => rows.find(row => row.id === id);
assert(byId("ebay").configuredMarkets.includes("us"), "Connected eBay must be recognized");
assert(byId("walmart").configuredMarkets.includes("us"), "Connected Walmart API must be recognized");
assert(byId("outin").configuredMarkets.includes("us"), "Connected OutIn Awin feed must be recognized");
assert.equal(byId("cozeware").configured, false, "A merchant without a feed must not claim an active catalog source");
assert.equal(byId("amazon").configured, false, "Storefront links alone are not an Amazon catalog connection");

const feeds = feedDefinitions({
  AFFILIATE_FEED_OUTIN_US_URL:"https://feed.example.com/outin.csv",
});
assert(feeds.some(x=>x.source==="feed-outin"&&x.markets.includes("us")),
  "Configured OutIn must be available as an independent source");
console.log("Merchant coverage: native APIs, direct feeds and unconfigured stores are kept distinct.");
