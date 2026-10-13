const assert = require("node:assert/strict");
// Test-only credentials configure a connected source without any network calls.
process.env.EBAY_CLIENT_ID = "merchandising-test";
process.env.EBAY_CLIENT_SECRET = "merchandising-test";
process.env.EBAY_CAMPAIGN_ID = "1234567890";
process.env.AFFILIATE_FEED_TRIBESIGNS_US_URL = 'https://feeds.example.com/tribesigns.csv';
process.env.PUBLIC_PRODUCT_SOURCES = "ebay,feed-tribesigns";
const { isPromotionEligible, promotionExpiresAt, selectMerchandise, merchandisingDiagnostics } = require("../src/merchandisingSelection");
const { PRICE_CONFIDENT_HOURS } = require("../src/productPresentation");
const now = Date.parse("2026-10-13T16:00:00Z");
const iso = at => new Date(at).toISOString();
const product = (id, changes = {}) => ({
  id, title: `Halloween Pumpkin Decoration Model ${id}`, market: "us", currency: "USD", source: "ebay",
  retailer_name: "eBay", status: "published", current_price: 40, checked_at: iso(now - 3600000),
  image_url: "https://i.ebayimg.com/pumpkin.jpg", affiliate_url: `https://www.ebay.com/itm/${id}`,
  availability: "In stock", shipping_summary: "Free shipping", return_summary: "30 day returns accepted",
  seller_rating: 99.5, seller_feedback_count: 400, category: "Home", ...changes,
});
const signal = changes => ({ id: "halloween", kind: "seasonal", title: "Halloween", market: "us",
  queries: ["halloween pumpkin"], categories: ["Home"], startsAt: iso(now - 86400000), endsAt: iso(now + 86400000), ...changes });
const valid = product(1);
assert(isPromotionEligible(valid, { now }));
assert.equal(promotionExpiresAt(valid), iso(Date.parse(valid.checked_at) + PRICE_CONFIDENT_HOURS * 3600000));
assert(isPromotionEligible(product(2, { availability: "in_stock" }), { now }), "normalized feed stock is known");
for (const change of [
  { status: "draft" }, { source: "unconnected-shop" }, { market: "ca" }, { currency: "CAD" },
  { checked_at: iso(now - (PRICE_CONFIDENT_HOURS + 1) * 3600000) }, { checked_at: iso(now + 1) },
  { checked_at: iso(now - PRICE_CONFIDENT_HOURS * 3600000) },
  { checked_at: "", updated_at: iso(now) }, { availability: "" }, { availability: "out_of_stock" },
  { availability: "expired" }, { image_url: "" }, { current_price: 0 },
  { affiliate_url: "http://www.ebay.com/itm/1" }, { affiliate_url: "https://127.0.0.1/foo" },
  { affiliate_url: "https://user:password@www.ebay.com/itm/1" }, { affiliate_url: "https://shop.internal/item" },
  { link_last_status: 404 }, { link_consecutive_failures: 1 }, { link_last_error: "timeout" },
  { link_health: { last_status: 410 } }, { last_status: 500 },
  { shipping_summary: "" }, { shipping_cost: 30 }, { return_summary: "" }, { return_summary: "No returns" },
  { return_summary: "Retours non acceptés" }, { return_summary: "Keine Rückgabe" },
  { rating: 3.5 }, { seller_rating: 80 },
]) assert.equal(isPromotionEligible(product(3, change), { now }), false, JSON.stringify(change));
assert(isPromotionEligible(product(4, { link_last_status: 200, link_consecutive_failures: 0 }), { now }));
const irrelevant = product(5, { title: "Luxury Memory Foam Mattress", category: "Home" });
const stale = product(6, { checked_at: iso(now - (PRICE_CONFIDENT_HOURS + 1) * 3600000) });
const duplicate = { ...valid, id: 7, affiliate_url: valid.affiliate_url };
const rows = [valid, irrelevant, stale, duplicate];
const results = selectMerchandise(rows, [signal(), signal({ id: "future", startsAt: iso(now + 1) }),
  signal({ id: "expired", endsAt: iso(now) }), signal({ id: "foreign", market: "ca" })], { now });
assert.equal(results.length, 1);
assert.deepEqual(results[0].products, [valid], "strict theme match, fresh price and family dedup");
assert.equal(results[0].products[0], valid, "selector returns original raw rows");
assert.equal(valid.score, undefined, "no fabricated score");
assert.equal(valid.original_price, undefined, "no fabricated savings");
assert.equal(selectMerchandise([irrelevant], [signal({ queries: [] })], { now })[0].products.length, 0,
  "a broad category alone never matches");
const laptop = product(10, { title: "Lenovo Gaming Laptop Computer", category: "Electronics" });
const accessory = product(11, { title: "Lenovo Gaming Laptop Replacement Charger", category: "Electronics" });
assert.deepEqual(selectMerchandise([laptop, accessory], [signal({ kind: "trend", queries: ["gaming laptop"] })], { now })[0].products, [laptop]);
assert.equal(selectMerchandise([valid], [signal()], { now, limitPerSignal: 0 })[0].products.length, 0);
assert.deepEqual(selectMerchandise([valid], [signal()], { now, market: "unknown" }), []);
const varied = [
  product(21, { title: "Halloween Pumpkin Ceramic Orange Sculpture", retailer_name: "Shop A", category: "Home" }),
  product(22, { title: "Halloween Pumpkin Wooden Giant Display", retailer_name: "Shop A", category: "Home" }),
  product(23, { title: "Halloween Pumpkin Cotton Printed Shirt", retailer_name: "Shop B", category: "Clothing" }),
];
assert.deepEqual(selectMerchandise(varied, [signal()], { now, limitPerSignal: 2 })[0].products.map(row => row.id), [21, 23],
  "qualified matches balance retailer and category");
console.log("merchandising selection: all checks passed");
const deskSignal = signal({kind:'trend',queries:['desk']});
const desk = product(70,{title:'Solid Wood Computer Desk',category:'Furniture'});
const chair = product(71,{title:'Office Desk Chair',category:'Furniture'});
const drawer = product(72,{title:'Under Desk Drawer Organizer',category:'Furniture'});
const bundled = product(73,{title:'Computer Desk with Drawer',category:'Furniture'});
assert.deepEqual(selectMerchandise([desk,chair,drawer,bundled],[deskSignal],{now})[0].products.map(p=>p.id),[70,73]);
const failedDesk = product(74,{title:'Standing Computer Desk',link_last_status:403,link_consecutive_failures:1,shipping_summary:''});
const diagnostics = merchandisingDiagnostics([desk,chair,failedDesk],[deskSignal],{now});
assert.equal(diagnostics.assessed,3);
assert.equal(diagnostics.signals[0].matched,2,'desk chairs must not inflate desk matches');
assert.equal(diagnostics.signals[0].eligible,1);
assert.equal(diagnostics.signals[0].rejectionCounts.link_check_failed,1);
assert.equal(diagnostics.signals[0].rejectionCounts.shipping_unknown,1);
assert.equal(diagnostics.signals[0].examples[0].linkStatus,403);
assert.deepEqual(diagnostics.signals[0].examples[0].reasons.sort(),['link_check_failed','shipping_unknown']);
const {withVerifiedRetailerTerms}=require('../src/verifiedRetailerTerms');
const policyNow=Date.parse('2026-10-13T20:00:00Z');
const rawDesk=product(80,{title:'Solid Wood Computer Desk',source:'feed-tribesigns',retailer_name:'Tribesigns',retailer_shop_url:'https://tribesigns.com/products/desk',shipping_summary:'Confirm at retailer',shipping_cost:null,return_summary:'See retailer policy',checked_at:iso(policyNow-3600000)});
const enrichedDesk=withVerifiedRetailerTerms(rawDesk,{now:policyNow});
assert.equal(enrichedDesk.shipping_cost,0);
assert(enrichedDesk.shipping_summary.includes('contiguous US'));
assert(enrichedDesk.return_summary.includes('Buyer pays return shipping'));
assert.equal(enrichedDesk.retailer_terms_sources.length,2);
assert(isPromotionEligible(enrichedDesk,{now:policyNow}),'Verified terms should unblock a genuine in-stock desk');
assert.equal(rawDesk.shipping_cost,null,'Raw feed data must remain intact');
assert.equal(withVerifiedRetailerTerms(rawDesk,{now:Date.parse('2026-11-12T18:00:00Z')}),rawDesk,'Expired policies cannot fill missing costs');
assert.equal(withVerifiedRetailerTerms({...rawDesk,market:'ca'},{now:policyNow}).shipping_cost,null);
assert.equal(withVerifiedRetailerTerms({...rawDesk,retailer_shop_url:'https://other.example.com/desk'},{now:policyNow}).shipping_cost,null);
const paidDesk=withVerifiedRetailerTerms({...rawDesk,shipping_cost:12,shipping_summary:'Delivery $12',return_summary:'No returns'},{now:policyNow});
assert.equal(paidDesk.shipping_cost,12,'Item-specific charges beat the general policy');
assert.equal(paidDesk.return_summary,'No returns');
assert(!isPromotionEligible(withVerifiedRetailerTerms({...rawDesk,title:'Customized Computer Desk'},{now:policyNow}),{now:policyNow}));
assert(!isPromotionEligible(product(81,{return_summary:'See retailer policy'}),{now}),'A placeholder is not proof that returns are accepted');
