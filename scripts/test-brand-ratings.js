const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const port = 26000 + process.pid % 10000;
process.env.PORT = String(port);
process.env.BACKEND_API_URL = `http://127.0.0.1:${port}`;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "odd-brand-ratings-"));
process.env.WEBSITE_SITE_NAME = "brand-ratings-test";
process.env.SUPPORTED_MARKETS = "us,ca";
process.env.EBAY_CLIENT_ID = "fixture-client";
process.env.EBAY_CLIENT_SECRET = "fixture-secret";
process.env.EBAY_CAMPAIGN_ID = "5339179772";
const config = require("../src/config");
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
const {ratingSummary, summarizeBrands} = require("../src/brandSummary");
const {SCORE_MODEL} = require("../src/ranker");
const {t} = require("../src/i18n");

assert.deepEqual(ratingSummary([{rating:null},{rating:0},{},{rating:""},{rating:NaN},{rating:Infinity},{rating:-1},{rating:6}]), {
  average_rating:null, rated_products:0, reported_reviews:0,
});
const mixedRatings=ratingSummary([{rating:4.8,review_count:100},{rating:0,review_count:999},{rating:"4.6",review_count:20},{rating:null}]);
assert(Math.abs(mixedRatings.average_rating-4.7)<1e-12);
assert.equal(mixedRatings.rated_products,2);
assert.equal(mixedRatings.reported_reviews,120);
assert.equal(ratingSummary([{rating:1},{rating:0}]).average_rating,1,"a genuine low rating must not be hidden");
assert.equal(ratingSummary([{rating:4.5,review_count:0}]).average_rating,4.5,"a supplied rating stays usable when its review volume is unknown");

const db = require("../src/db");
require("../app");
const now = new Date().toISOString();
function product(id, brand, title, rating, reviews=0, market="us") {
  return {external_id:`${market}:ebay:brand-${id}`,provider_external_id:`ebay:brand-${id}`, market,
    brand, brand_slug:brand.toLowerCase(), title, category:"Electronics", normalized_category:"Electronics",
    image_url:`https://i.ebayimg.com/images/g/brand-${id}/s-l1600.jpg`, affiliate_url:`https://www.ebay.com/itm/${100000000000+id}?campid=5339179772`,
    retailer_name:"eBay",source:"ebay",status:"published",availability:"In stock", current_price:100+id,currency:market==="ca"?"CAD":"USD",
    checked_at:now,updated_at:now,first_seen_at:now,last_seen_at:now, rating, review_count:reviews,
    seller_name:"Fixture seller",seller_rating:99.8,seller_feedback_count:1000,shipping_summary:"Free shipping",return_summary:"30-day returns",
    score:80,commerce_quality:80,evidence_confidence:80,score_breakdown:JSON.stringify({model:SCORE_MODEL})};
}
const fixtures=[product(1,"Tidewe","Tidewe Hunting Wader Boots",0),product(2,"Tidewe","Tidewe Outdoor Hunting Jacket",null),
  product(3,"HP","HP LaserJet Duplex Printer",4.8,120),product(4,"HP","HP Pavilion Laptop",null),product(5,"HP","HP Wireless Mouse",0),
  product(6,"HP","HP Envy Laptop Canada",4.4,50,"ca")];
for(const p of fixtures)db.prepare(`INSERT INTO products(${Object.keys(p).join(",")}) VALUES(${Object.keys(p).map(()=>"?").join(",")})`).run(...Object.values(p));
const grouped=summarizeBrands([...fixtures.slice(0,5),fixtures[2]]);
assert.equal(grouped.find(b=>b.brand==="HP").product_count,3,"duplicate offers must not change the denominator");
assert.equal(grouped.find(b=>b.brand==="HP").avg_rating,4.8);
assert.equal(grouped.find(b=>b.brand==="Tidewe").avg_rating,null);

const base=`http://127.0.0.1:${port}`;
async function get(route) { const res=await fetch(base+route);assert.equal(res.status,200,route);return res; }
(async()=>{
  for(let attempt=0;;attempt++){
    try {await get("/api/status");break;} catch(error) {if(attempt>100)throw error;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const brands=await (await get("/api/brands?market=us")).json();
  assert.equal(brands.find(b=>b.brand==="Tidewe").avg_rating,null);
  assert.equal(brands.find(b=>b.brand==="HP").avg_rating,4.8);
  const hp=await (await get("/api/brands/hp?market=us")).json();
  assert.equal(hp.summary.average_rating,4.8);
  assert.equal(hp.summary.rated_products,1);
  assert.equal(hp.summary.products,3);
  assert.equal(hp.summary.reported_reviews,120);
  const ca=await (await get("/api/brands/hp?market=ca")).json();
  assert.equal(ca.summary.average_rating,4.4,"do not mix another market into the average");
  assert.equal(ca.summary.products,1);
  assert.equal(ca.url,"/ca/brand/hp");
  const tidewe=await (await get("/api/brands/tidewe?market=us")).json();
  assert.equal(tidewe.summary.average_rating,null);
  for(const language of ["en","es","fr","de"])assert.notEqual(t(language,"page.noRatingData"),"page.noRatingData");
  const list=await (await get("/us/brands?lang=en")).text();
  assert(list.includes("No review data available"));
  assert(list.includes("4.8 / 5"));
  const detail=await (await get("/us/brand/tidewe?lang=en")).text();
  assert(detail.includes("No review data available"));
  assert(!detail.includes("0.0 / 5"));
  const rated=await (await get("/us/brand/hp?lang=en")).text();
  assert(rated.includes("4.8 / 5"));
  assert(rated.includes("Rated products: 1 of 3"));
  const spanish=await (await get("/us/brand/tidewe?lang=es")).text();
  assert(spanish.includes("No hay datos de valoraciones"));
  console.log("Brand ratings: known-only averages, honest missing data, coverage, duplicate handling, market isolation and real HTML/API routes passed.");
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
