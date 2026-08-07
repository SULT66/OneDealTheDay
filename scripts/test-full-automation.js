const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-automation-"));

const { RETAILERS, feedDefinitions } = require("../src/retailerCatalog");
const { parseDelimited, parseRecords, safeFeedUrl } = require("../src/providers/affiliateFeed");
const { scoreOffers, selectUniqueProducts } = require("../src/ranker");
const { refreshMarket } = require("../src/refresh");
const db = require("../src/db");

assert(RETAILERS.length >= 19, "The complete target retailer catalog is missing");
for (const retailer of ["Amazon", "eBay", "Walmart", "Target", "Best Buy", "Currys", "Fnac", "Darty", "MediaMarkt", "Saturn", "OTTO", "Samsung"]) {
  assert(RETAILERS.some(item => item.name === retailer), `${retailer} is missing from retailer coverage`);
}
assert.throws(() => safeFeedUrl("http://localhost/feed.csv"), /public HTTPS/);
assert.strictEqual(parseDelimited('id,title\n1,"A, B"\n')[0].title, "A, B");
assert.strictEqual(parseRecords({body:'{"products":[{"id":"1"}]}', contentType:"application/json", pathname:"/feed"}).length, 1);
assert.strictEqual(parseRecords({body:"<products><product><id>1</id><title>Test</title></product></products>", contentType:"application/xml", pathname:"/feed"}).length, 1);

const feedEnv = {AFFILIATE_FEED_TARGET_US_URL:"https://feed.test/target.csv"};
const definitions = feedDefinitions(feedEnv);
assert.strictEqual(definitions.length, 1);
assert.strictEqual(definitions[0].retailerName, "Target");
const customDefinitions = feedDefinitions({AFFILIATE_FEEDS_JSON:JSON.stringify([{
  id:"future-store", retailerName:"Future Store", market:"ca", url:"https://feed.test/future.json", format:"json"
}])});
assert.strictEqual(customDefinitions[0].source, "feed-future-store", "A future retailer cannot be added without code changes");

function records(retailer, prefix, duplicateFirst = false) {
  return Array.from({length:6}, (_, index) => ({
    id:`${prefix}-${index + 1}`,
    title:`${retailer} Product ${index + 1}`,
    description:`Verified ${retailer} affiliate product`,
    category:"home gadgets",
    brand:"Acme",
    gtin:duplicateFirst && index === 0 ? "00012345678905" : `0001234567${prefix === "t" ? "1" : "2"}${String(index).padStart(2, "0")}`,
    price:String(20 + index),
    original_price:String(30 + index),
    currency:"USD",
    image_url:`https://images.test/${prefix}-${index + 1}.jpg`,
    affiliate_url:`https://click.test/${prefix}-${index + 1}`,
    seller_name:retailer,
    shipping_summary:"Free shipping",
    return_summary:"30 day returns",
    availability:"In stock",
    rating:"4.7",
    review_count:"1200"
  }));
}

const targetRecords = records("Target", "t", true);
const bestBuyRecords = records("Best Buy", "b", true);
bestBuyRecords[0].gtin = targetRecords[0].gtin;

const originalFetch = global.fetch;
global.fetch = async url => {
  const value = String(url);
  if (value.includes("failed")) return new Response("no", {status:503});
  const body = value.includes("target") ? targetRecords : bestBuyRecords;
  return new Response(JSON.stringify({products:body}), {status:200, headers:{"content-type":"application/json"}});
};

const market = {
  code:"us",
  name:"United States",
  currency:"USD",
  timezone:"America/New_York",
  searchKeywords:["home gadgets"],
  affiliateTag:""
};
const config = {
  provider:"multi",
  markets:["us"],
  affiliateFeeds:[
    {id:"target-us", source:"feed-target", retailerId:"target", retailerName:"Target", network:"Impact", markets:["us"], url:"https://feed.test/target.json", format:"json", headersJson:"", fieldMapJson:""},
    {id:"best-buy-us", source:"feed-best-buy", retailerId:"best-buy", retailerName:"Best Buy", network:"Impact", markets:["us"], url:"https://feed.test/bestbuy.json", format:"json", headersJson:"", fieldMapJson:""},
    {id:"wayfair-us", source:"feed-wayfair", retailerId:"wayfair", retailerName:"Wayfair", network:"CJ", markets:["us"], url:"https://feed.test/failed.json", format:"json", headersJson:"", fieldMapJson:""}
  ],
  ebayClientId:"",
  ebayClientSecret:"",
  ebayCampaignId:"",
  rainforestApiKey:"",
  bluecartApiKey:"",
  maxProductsPerSource:500,
  staleOfferHours:48,
  marketConfig:() => market,
  walmartAffiliateTemplateForMarket:() => ""
};

(async () => {
  try {
    const scored = scoreOffers([...targetRecords, ...bestBuyRecords].map((item, index) => ({
      ...item,
      external_id:item.id,
      product_key:`gtin:${item.gtin}`,
      current_price:Number(item.price),
      original_price:Number(item.original_price),
      image_url:item.image_url,
      affiliate_url:item.affiliate_url,
      retailer_name:item.seller_name,
      seller_name:item.seller_name,
      shipping_summary:item.shipping_summary,
      return_summary:item.return_summary,
      availability:item.availability,
      rating:Number(item.rating),
      review_count:Number(item.review_count),
      source:index < 6 ? "feed-target" : "feed-best-buy",
      source_rank:(index % 6) + 1
    })), {currency:"USD", minimumRating:0, minimumReviews:0, minimumScore:60});
    assert.strictEqual(scored.length, 12, "Multi-store scoring discarded an alternative offer");
    assert.strictEqual(selectUniqueProducts(scored).length, 11, "Daily selection did not deduplicate the matching product");

    const result = await refreshMarket(config, "us");
    assert.strictEqual(result.selected, 10);
    assert.strictEqual(result.sources.length, 3);
    assert.strictEqual(result.sources.filter(source => source.status === "success").length, 2);
    assert.strictEqual(result.sources.filter(source => source.status === "failed").length, 1);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products").get().n, 12, "All valid store offers were not persisted");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products WHERE product_key=?").get(`gtin:${targetRecords[0].gtin}`).n, 2, "Matching cross-store offers were not retained");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM daily_drops").get().n, 10);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM source_refresh_runs").get().n, 3);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM automation_alerts WHERE resolved_at IS NULL").get().n, 1);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM distribution_queue WHERE status='ready'").get().n, 2);
    assert(db.prepare("SELECT COUNT(*) n FROM products WHERE provider_external_id LIKE 'feed-%:%'").get().n === 12, "Provider IDs are not source-qualified");
    console.log("Full multi-retailer automation validation passed.");
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
