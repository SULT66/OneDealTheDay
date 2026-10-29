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
  rating:4.7, review_count:30, seller_rating: 99.5, seller_feedback_count: 400, category: "Home", ...changes,
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
assert(isPromotionEligible(enrichedDesk,{now:policyNow}),'Verified terms with product reviews should qualify a genuine in-stock desk');
assert.equal(rawDesk.shipping_cost,null,'Raw feed data must remain intact');
assert.equal(withVerifiedRetailerTerms(rawDesk,{now:Date.parse('2026-11-12T18:00:00Z')}),rawDesk,'Expired policies cannot fill missing costs');
assert.equal(withVerifiedRetailerTerms({...rawDesk,market:'ca'},{now:policyNow}).shipping_cost,null);
assert.equal(withVerifiedRetailerTerms({...rawDesk,retailer_shop_url:'https://other.example.com/desk'},{now:policyNow}).shipping_cost,null);
const paidDesk=withVerifiedRetailerTerms({...rawDesk,shipping_cost:12,shipping_summary:'Delivery $12',return_summary:'No returns'},{now:policyNow});
assert.equal(paidDesk.shipping_cost,12,'Item-specific charges beat the general policy');
assert.equal(paidDesk.return_summary,'No returns');
assert(!isPromotionEligible(withVerifiedRetailerTerms({...rawDesk,title:'Customized Computer Desk'},{now:policyNow}),{now:policyNow}));
assert(!isPromotionEligible(product(81,{return_summary:'See retailer policy'}),{now}),'A placeholder is not proof that returns are accepted');
const archived = product(90,{status:'archived'});
Object.defineProperty(archived,'current_price',{get(){throw new Error('Archived offers must not be scored');}});
assert.equal(isPromotionEligible(archived,{now}),false,'Eligibility must stop before evaluating archived offer details');

const {signalRejectionReasons}=require('../src/merchandisingSelection');
const dated=signal({eventAt:iso(now+18*86400000),metadata:{deliveryLeadDays:7}});
const onTime=product(100,{delivery_estimated_at:iso(now+7*86400000),delivery_country:'US'});
assert.equal(selectMerchandise([onTime, product(101,{rating:0,review_count:0}), product(102,{review_count:2})],[dated],{now,requireReviews:true})[0].products.length,1);
assert.deepEqual(signalRejectionReasons(product(103),dated,{now}),['holiday_delivery_unknown']);
assert.deepEqual(signalRejectionReasons({...onTime,delivery_country:'CA'},dated,{now}),['holiday_delivery_unknown']);
assert.deepEqual(signalRejectionReasons({...onTime,delivery_estimated_at:iso(now+17*86400000)},dated,{now}),['holiday_delivery_late']);
const reviewedFeed=product(104,{source:'feed-tribesigns',retailer_name:'Tribesigns'});
assert.equal(selectMerchandise([reviewedFeed,valid],[signal()],{now,limitPerSignal:1})[0].products[0].source,'ebay');
assert.equal(isPromotionEligible(product(105,{rating:0,review_count:0}),{now}),false,'Established seller is not a substitute for product reviews on featured shelves');
const consoleSignal=signal({kind:'trend',queries:['Nintendo Switch 2 console']});
const oldConsole=product(110,{title:'New Nintendo Switch v2 Console Gaming System HAC-001(-01) Red/Blue'});
const newConsole=product(111,{title:'Nintendo Switch 2 Console with Mario Kart Bundle'});
assert.deepEqual(selectMerchandise([oldConsole,newConsole],[consoleSignal],{now})[0].products.map(p=>p.id),[111],
  'Product generations must not be discarded as if they were price constraints');
const phoneSignal=signal({kind:'trend',queries:['iPhone 15']});
assert.equal(selectMerchandise([product(112,{title:'Apple iPhone 14 Unlocked Smartphone'})],[phoneSignal],{now})[0].products.length,0);

const unreviewedTheme = product(120,{rating:0,review_count:0});
assert(isPromotionEligible(unreviewedTheme,{now,requireReviews:false}),'Thematic browsing accepts honest unreviewed products with valid buying terms');
assert(!isPromotionEligible(unreviewedTheme,{now}),'Recommendations still require product reviews');
assert.equal(selectMerchandise([unreviewedTheme],[signal()],{now})[0].products.length,1);
assert.equal(selectMerchandise([unreviewedTheme],[signal()],{now,requireReviews:true})[0].products.length,0);
for (const change of [{shipping_summary:''},{availability:'out_of_stock'},{link_last_status:404},{rating:3.2},{return_summary:'No returns'}]) {
 assert(!isPromotionEligible({...unreviewedTheme,...change},{now,requireReviews:false}),'Theme mode must retain buying safeguards');
}
const brandedFoodSignal=signal({kind:'trend',title:'Purina Dog Chow adult dry dog food',
  queries:['high protein dry dog food for adult dogs'],sourceUrls:['https://example.com/bestsellers']});
const otherFood=product(130,{title:'High protein dry dog food for adult dogs',brand:'Another Brand'});
assert.equal(selectMerchandise([otherFood],[brandedFoodSignal],{now})[0].products.length,0,
  'A broad alias cannot publish another product under a specifically named external topic');
const temporarilyUnavailable = {...unreviewedTheme,link_last_status:500,link_consecutive_failures:1};
assert(isPromotionEligible(temporarilyUnavailable,{now,requireReviews:false}),
  'Fresh source-verified thematic products survive one transient retailer failure');
assert(!isPromotionEligible({...temporarilyUnavailable,link_consecutive_failures:3},{now,requireReviews:false}));
assert(!isPromotionEligible({...temporarilyUnavailable,link_last_status:404},{now,requireReviews:false}));
assert(!isPromotionEligible({...temporarilyUnavailable,link_last_status:403},{now,requireReviews:false}));
assert(!isPromotionEligible({...temporarilyUnavailable,checked_at:iso(now-3*86400000)},{now,requireReviews:false}));

const selling = product(201,{ebay_sold_quantity:1200,category:'Home',retailer_name:'Shop A'});
const fewerSales = product(202,{ebay_sold_quantity:110,category:'Clothing',retailer_name:'Shop B'});
const unknownSales = product(203,{category:'Electronics',retailer_name:'Shop C'});
assert.deepEqual(selectMerchandise([unknownSales,fewerSales,selling],[signal()],{now})[0].products.map(p=>p.id),[201,202,203], 'Sales preference survives diversity and family dedup');
assert.equal(selectMerchandise([product(204,{ebay_sold_quantity:9000,return_summary:'No returns'}),selling],[signal()],{now})[0].products.length,1,'Sales never override buying checks');
assert.equal(selectMerchandise([unknownSales],[signal()],{now})[0].products.length,1,'Missing sales remains unknown and does not empty the shelf');

const {activeSeeds,salesEvidence}=require('../src/merchandisingSeeds');
const seedNow=Date.parse('2026-10-14T12:00:00Z');
const seed=activeSeeds({market:'us',now:seedNow})[0];
const researched=product(300,{title:seed.title, external_id:`us:ebay:v1|${seed.legacyId}|123`,
  affiliate_url:seed.sourceUrl,checked_at:iso(seedNow-1000),rating:0,review_count:0});
assert.equal(salesEvidence(researched,{now:seedNow}).quantity,1933);
assert.equal(salesEvidence(researched,{now:seedNow}).scope,'listing_all_variants');
assert.equal(salesEvidence({...researched,title:'Unrelated listing'},{now:seedNow}),null);
assert.equal(salesEvidence({...researched,source:'amazon'},{now:seedNow}),null);
assert.equal(salesEvidence(researched,{now:Date.parse(seed.expiresAt)}),null,'Research expires with the campaign');
assert.equal(salesEvidence({...researched,ebay_sold_quantity:8},{now:seedNow}).quantity,1933,'Parent total is distinct from a single variant estimate');
const single=activeSeeds({market:'us',now:seedNow})[1];
assert.equal(salesEvidence({...researched,title:single.title,external_id:`us:ebay:v1|${single.legacyId}|0`,ebay_sold_quantity:8},{now:seedNow}).quantity,8,'A newer lower single-listing API count must win');
const popularSignal=signal({queries:['Halloween mask'],startsAt:iso(seedNow-86400000),endsAt:iso(seedNow+86400000),metadata:{minimumEbaySales:100}});
const shelf=selectMerchandise([researched,product(301,{title:'Halloween mask',checked_at:iso(seedNow-1000)})],[popularSignal],{now:seedNow})[0];
assert.deepEqual(shelf.products.map(p=>p.id),[300],'Unknown sales cannot fill a sales-backed shelf');
assert.equal(selectMerchandise([{...researched,return_summary:'No returns'}],[popularSignal],{now:seedNow})[0].products.length,0,'Research evidence cannot waive buying checks');

const hosting=signal({id:'thanksgiving',title:'Thanksgiving hosting',queries:['dinnerware','food thermometer','tablecloth']});
const dinnerware=[201,202,203,204,205].map((id,i)=>product(id,{title:`Brand${i} Stoneware Dinnerware Set`,product_key:`gtin:${id}`,category:'Home & Kitchen'}));
const hostingRows=[...dinnerware,product(206,{title:'Digital Food Thermometer',product_key:'gtin:206'}),product(207,{title:'Linen Tablecloth',product_key:'gtin:207'})];
const hostingPicks=selectMerchandise(hostingRows,[hosting],{now,limitPerSignal:6})[0].products;
assert.equal(hostingPicks.filter(p=>/dinnerware/i.test(p.title)).length,1);
assert.equal(hostingPicks.length,3,'a shorter varied shelf is preferable to five sets of plates');
