process.env.MERCHANDISING_FOCUS = 'all';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odd-discovery-'));
process.env.SUPPORTED_MARKETS = 'us';
process.env.EBAY_CLIENT_ID = 'test-discovery';
process.env.EBAY_CLIENT_SECRET = 'test-discovery';
process.env.EBAY_CAMPAIGN_ID = '5339179772';
process.env.PUBLIC_PRODUCT_SOURCES = 'ebay';
process.env.MERCHANDISING_ENABLED = 'true';
const config = require('../src/config');
const db = require('../src/db');
const {discoveryKeywords, discoverEbay} = require('../src/merchandisingDiscovery');
const {ensureMerchandisingSchema, runMerchandising, getMerchandisingShelves, merchandisingStatus} = require('../src/merchandising');
ensureMerchandisingSchema(db);
const ebay = require('../src/providers/ebay');
const now = Date.now(), DAY = 86400000, iso = value => new Date(value).toISOString();
const seasonal = {id:'test-halloween', title:'Halloween', kind:'seasonal', market:'us',
  queries:['Halloween decoration','Halloween costume','Halloween party supplies'],
  startsAt:iso(now-DAY), endsAt:iso(now+7*DAY), eventAt:iso(now+18*DAY), metadata:{deliveryLeadDays:7}};
const winter = {...seasonal,id:'winter',title:'Winter',queries:['blanket','duvet','humidifier','winter coat']};
assert.equal(discoveryKeywords([seasonal],{market:'us',now,limit:0}).length,0);
const terms = discoveryKeywords([seasonal,winter],{market:'us',now});
assert.equal(terms.length,6);
assert.equal(new Set(terms).size,6);
const trending = Array.from({length:6},(_,i)=>({...seasonal,id:`interest-${i}`,kind:'trend',queries:[`trending product ${i}`]}));
const prioritized=discoveryKeywords([seasonal,winter,...trending],{market:'us',now});
assert.equal(prioritized.filter(q=>q.startsWith('trending')).length,2,'Trends must not consume the seasonal search allowance');
assert.equal(prioritized.length,6);
assert(terms.some(term=>term.startsWith('Halloween')));
assert.deepEqual(discoveryKeywords([{...seasonal,startsAt:iso(now+DAY)}],{market:'us',now}),[]);
assert.deepEqual(discoveryKeywords([seasonal],{market:'ca',now}),[]);
let calls=0;
ebay.searchProducts = async options => {
  calls++;
  assert.deepEqual(options.keywords,terms);
  assert.equal(options.rotate,false,'Targeted themes must not rotate through the broad catalogue list');
  assert.equal(options.detailLimit,600);
  assert.equal(options.maxAttempts,2);
  assert.equal(options.requestTimeoutMs,20000);
  assert.equal(options.searchConcurrency,2);
  assert.equal(options.detailConcurrency,4);
  assert.equal(options.targetEligible,240);
  assert.equal(options.searchLimit,100);
  assert.equal(options.strictQueries,true);
  return [{external_id:'v1|123456789012|0', title:'Halloween Decoration Pumpkin Sculpture',
    category:'Halloween decoration', source:'ebay',market:'us',currency:'USD',
    ebay_sold_quantity:432,current_price:30,image_url:'https://i.ebayimg.com/pumpkin.jpg',
    affiliate_url:'https://www.ebay.com/itm/123456789012?campid=5339179772',retailer_name:'eBay',
    availability:'In stock',rating:4.8,review_count:40,seller_rating:4.98,seller_feedback_count:2000,
    shipping_summary:'Free shipping',shipping_cost:0,return_summary:'30 day returns accepted',
    checked_at:iso(Date.now()),delivery_estimated_at:iso(now+4*DAY),delivery_country:'US',delivery_postal_code:'11201'}];
};
(async()=>{
  const old = db.prepare("INSERT INTO products(external_id,market,source,status,title,availability,last_seen_at) VALUES(?,?,?,?,?,?,?)")
    .run('us:ebay:old-unrelated','us','ebay','published','Existing unrelated computer desk','In stock',iso(now-10*DAY));
  const result=await discoverEbay(config,{market:'us',keywords:terms,signals:[{...seasonal,metadata:{...seasonal.metadata,eventKey:'halloween'}}],now});
  assert.equal(result.status,'success');
  assert.equal(calls,1);
  const imported=db.prepare("SELECT * FROM products WHERE external_id='us:ebay:v1|123456789012|0'").get();
  assert(imported,'Targeted products must persist in the actual catalogue');
  assert.equal(imported.average_30_day_price,0,'New imports persist an unknown history average as zero rather than a missing migration field');
  assert.equal(imported.lowest_30_day_price,0);
  assert.equal(imported.price_history_observation_count,0,'Scoring-time history metadata persists before the first observation is recorded');
  assert.equal(imported.price_history_distinct_days,0);
  assert.equal(imported.delivery_country,'US');
  assert.equal(imported.ebay_sold_quantity,432);
  assert.equal(imported.delivery_estimated_at,iso(now+4*DAY));
  assert.equal(imported.delivery_postal_code,'11201');
  assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(old.lastInsertRowid).status,'published',
    'Targeted search must not archive unrelated eBay listings');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_drops').get().n,0,'Targeted import must not change Daily Drop picks');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM merchandising_runs').get().n,0,'Import must not recurse into merchandising');
  assert(db.prepare('SELECT COUNT(*) n FROM price_history WHERE product_id=?').get(imported.id).n>0,'Real price snapshot must persist');
  const checkedNow=Date.now();
  // A single custom seasonal brief uses the real selector and live catalogue.
  db.prepare('INSERT INTO merchandising_signals VALUES(?,?,?,?,?,?)')
    .run('us',seasonal.id,'calendar',now-DAY,now+7*DAY,JSON.stringify(seasonal));
  db.prepare('INSERT INTO merchandising_status VALUES(?,?,?,?,?)')
    .run('us','calendar',checkedNow,'success',JSON.stringify({policyVersion:'holiday-sales-v5-varied-hosting'}));
  let discoveryCalls=0;
  const discover=async()=>{discoveryCalls++;return {status:'success',count:1,observedAt:iso(Date.now())};};
  assert.equal((await runMerchandising(db,{now:checkedNow,discover})).status,'success');
  let shelf=getMerchandisingShelves(db,{now:Date.now()})[0];
  assert.equal(shelf.products[0].id,imported.id);
  assert.equal(shelf.selectionEvidence[imported.id].matchedQuery,'Halloween decoration');
  assert.equal(shelf.selectionEvidence[imported.id].ebaySoldQuantity,432);
  assert.equal(shelf.selectionEvidence[imported.id].arrivalEstimate,iso(now+4*DAY));
  await runMerchandising(db,{now:checkedNow+3600000,discover});
  assert.equal(discoveryCalls,1,'Persisted discovery throttle applies across runs');
  db.prepare('UPDATE products SET delivery_estimated_at=? WHERE id=?').run(iso(now+17*DAY),imported.id);
  assert.equal(getMerchandisingShelves(db,{now:checkedNow+3600000}).length,0,'Reads must remove an offer whose arrival is now too late');
  const diagnostics=merchandisingStatus(db,{now:checkedNow+3600000}).diagnostics;
  assert.equal(diagnostics.signals[0].rejectionCounts.holiday_delivery_late,1);
  assert.equal((await discoverEbay({...config,ebayClientId:''},{market:'us',keywords:terms})).status,'disabled');
  console.log('Merchandising discovery: bounded eBay import, destination estimates, snapshots, isolation, throttle and read-time expiry passed');
  db.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
