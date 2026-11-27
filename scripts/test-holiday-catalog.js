const assert=require('node:assert/strict');
process.env.PUBLIC_PRODUCT_SOURCES='ebay';
process.env.EBAY_CLIENT_ID='holiday-test';process.env.EBAY_CLIENT_SECRET='holiday-test';process.env.EBAY_CAMPAIGN_ID='5339179772';
const Database=require('better-sqlite3');
const {createHolidayCuration,qualified,upgradePlan,IMPORT_POLICY}=require('../src/holidayCuration');
const {getHolidayCollection,isHolidayProduct}=require('../src/holidayCatalog');
const {normalizeCatalogProduct}=require('../src/catalogTaxonomy');
const db=new Database(':memory:');
const sample={id:1,market:'us',title:'Christmas Ornament Model 100000',normalized_category:'Christmas & New Year',status:'published',source:'ebay',retailer_name:'eBay',availability:'In stock',image_url:'https://example.com/item.webp',affiliate_url:'https://www.ebay.com/itm/123456789000',current_price:20,rating:4.7,review_count:50,seller_rating:4.99,seller_feedback_count:2000,score:70,ranking_score:70,evidence_confidence:80,updated_at:''};
db.exec(`CREATE TABLE products(${Object.entries(sample).map(([key,value])=>`${key} ${typeof value==='number'?'REAL':'TEXT'}`).join(',')}); CREATE TABLE daily_drops(product_id INTEGER,market TEXT); CREATE TABLE live_drops(affiliate_url TEXT,market TEXT,published INTEGER);`);
const insert=db.prepare(`INSERT INTO products VALUES(${Object.keys(sample).map(()=>'?').join(',')})`);
for(let i=1;i<=620;i++)insert.run(...Object.values({...sample,id:i,title:`Electronic Device Model ${100000+i}`,normalized_category:'Electronics',affiliate_url:`https://www.ebay.com/itm/${123456789000+i}`}));
insert.run(...Object.values({...sample,id:1000,title:'Halloween Pumpkin Decoration Model 200000',normalized_category:'Halloween'}));
for(let i=0;i<30;i++)insert.run(...Object.values({...sample,id:2000+i,title:`Christmas Ornament Model ${200000+i}`,affiliate_url:`https://www.ebay.com/itm/${223456789000+i}`,current_price:20+i}));
db.prepare("INSERT INTO daily_drops VALUES(1,'us')").run();
db.prepare("INSERT INTO live_drops VALUES(?,'us',1)").run(`https://www.ebay.com/itm/${123456789002}`);
let cleared=0;const service=createHolidayCuration({db,config:{isProduction:false},clearCaches:()=>cleared++});
const first=service.initialize(),status=service.publicStatus();
assert.equal(status.electronics.before,620);assert.equal(status.electronics.current,120);assert.equal(status.halloweenRemaining,0);
assert.equal(db.prepare("SELECT count(*) n FROM products WHERE status='hidden'").get().n,501);
assert.equal(db.prepare('SELECT status FROM products WHERE id=1').get().status,'published');
assert.equal(db.prepare('SELECT status FROM products WHERE id=2').get().status,'published');
assert.deepEqual(service.initialize(),first,'Restarting cannot remove another 500');assert.equal(cleared,1);
assert.equal(status.tasks[0].category,'Christmas & New Year');
assert.equal(status.tasks.find(t=>t.category==='Travel').target,70);
assert.equal(getHolidayCollection(db,{now:Date.parse('2026-10-29')}).total,30);
const page1=getHolidayCollection(db,{}),page2=getHolidayCollection(db,{page:2});
assert.equal(page1.products.length,24);assert.equal(page2.products.length,6);assert(!page2.products.some(p=>page1.products.some(a=>a.id===p.id)));
assert.equal(getHolidayCollection(db,{market:'ca'}).total,0);
assert.equal(getHolidayCollection(db,{q:'lights'}).total,0);
assert.equal(getHolidayCollection(db,{sort:'price-asc'}).products[0].current_price,20);
assert.equal(qualified(sample),true);assert.equal(qualified({...sample,seller_rating:4.5}),false);assert.equal(qualified({...sample,rating:2}),false);
assert.equal(qualified({...sample,image_url:'http://example.com/a'}),false);
assert.equal(isHolidayProduct({title:'Christmas repair service'}),false);
assert.equal(normalizeCatalogProduct({...sample,title:'Christmas string lights'}).normalized_category,'Christmas & New Year');
assert.equal(getHolidayCollection(db,{maxPrice:25}).total,6,'Budget filtering applies before pagination');
assert.equal(getHolidayCollection(db,{preview:true}).products.length,1,'A preview contains one ornament set, not eight colour variants');
db.close();console.log('Holiday catalogue: 500 fewer electronics, protected drops, retired Halloween, restart safety, collection pagination and quality gates passed.');

const interrupted={id:'holiday-catalog-2026-v1',status:'partial',hiddenIds:[101,102],baseline:{Electronics:1598},electronicsTarget:1098,tasks:[
 {category:'Travel',before:8,target:70,attempts:2,status:'complete'},
 {category:'Baby & Kids',before:50,target:100,attempts:4,status:'shortfall'},
 {category:'Furniture',before:71,target:121,attempts:4,status:'shortfall'}
]};
assert.equal(upgradePlan(interrupted,{'Travel':70,'Baby & Kids':99,'Furniture':85}),true);
assert.equal(interrupted.importPolicy,IMPORT_POLICY);
assert.equal(interrupted.status,'running');
assert.equal(interrupted.tasks[0].status,'complete');
assert.equal(interrupted.tasks[0].attempts,2,'Completed batches are preserved');
assert.equal(interrupted.tasks[1].status,'pending');
assert.equal(interrupted.tasks[1].queryOffset,12,'Retries use additional search terms');
assert.equal(interrupted.tasks[1].attempts,0);
assert.deepEqual(interrupted.hiddenIds,[101,102],'A retry never removes electronics again');
assert.equal(interrupted.electronicsTarget,1098);
assert.deepEqual(interrupted.baseline,{Electronics:1598});
interrupted.tasks[1].attempts=1;
assert.equal(upgradePlan(interrupted,{}),false,'The migration runs once across process restarts');
assert.equal(interrupted.tasks[1].attempts,1);
console.log('Holiday completion: preserved baseline, no repeated removals, resumed shortfalls, additional terms and one-time policy migration passed.');

const {reconcilePlan,HOLIDAY_TARGET}=require('../src/holidayCuration');
const finished={status:'complete',importPolicy:'holiday-curation-v2-partner-completion',hiddenIds:[1],electronicsTarget:1098,tasks:[
 {category:'Christmas & New Year',target:150,attempts:3,status:'complete'},
 {category:'Office',target:153,attempts:1,status:'complete'}
]};
upgradePlan(finished,{'Christmas & New Year':150,Office:147});
assert.equal(finished.tasks[0].target,HOLIDAY_TARGET);
assert.equal(HOLIDAY_TARGET,500);
assert(finished.tasks.every(t=>t.status==='pending'),'completed-but-depleted categories must resume');
assert.equal(finished.electronicsTarget,1098);
assert.deepEqual(finished.hiddenIds,[1]);
finished.tasks.forEach(t=>t.status='complete');finished.status='complete';
reconcilePlan(finished,{'Christmas & New Year':500,Office:147});
assert.equal(finished.status,'running');
assert.equal(finished.tasks[1].status,'pending');
finished.tasks[1].attempts=8;
reconcilePlan(finished,{'Christmas & New Year':500,Office:147});
assert.equal(finished.status,'partial','exhausted shortfalls are never reported as complete');
console.log('Holiday expansion: 500 target, depleted category recovery and truthful partial status passed.');

const {getThanksgivingCollection}=require('../src/thanksgivingCatalog');
const thanksgivingDb=new Database(':memory:');
const hosting={...sample,title:'Corelle Dinnerware Set',shipping_summary:'Free shipping',shipping_cost:0,return_summary:'30 day returns accepted',checked_at:'2026-10-29T12:00:00Z',currency:'USD'};
thanksgivingDb.exec(`CREATE TABLE products(${Object.entries(hosting).map(([key,value])=>`${key} ${typeof value==='number'?'REAL':'TEXT'}`).join(',')})`);
const hostingInsert=thanksgivingDb.prepare(`INSERT INTO products VALUES(${Object.keys(hosting).map(()=>'?').join(',')})`);
for(const row of [hosting,{...hosting,id:2,title:'Instant Food Thermometer',affiliate_url:'https://www.ebay.com/itm/123456789002'},{...hosting,id:3,title:'Unrelated Phone Charger',affiliate_url:'https://www.ebay.com/itm/123456789003'}])hostingInsert.run(...Object.values(row));
const hostingNow=Date.parse('2026-10-29T13:00:00Z');
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:hostingNow}).total,2);
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:hostingNow,q:'table'}).total,1);
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:hostingNow,q:'constructor'}).total,2,'Unknown filters safely show the collection');
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:hostingNow,q:'kitchen'}).products[0].id,2);
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:hostingNow,market:'ca'}).active,false,'Canadian Thanksgiving has already passed');
assert.equal(getThanksgivingCollection(thanksgivingDb,{now:Date.parse('2026-11-28')}).active,false);
thanksgivingDb.close();
console.log('Thanksgiving collection: real product matching, intent filters and regional expiry passed.');

const holidayDb = new Database(':memory:');
const checked = new Date().toISOString();
const holidayRow = {...sample, checked_at:checked, delivery_estimated_at:'', delivery_country:'US',
  delivery_postal_code:'11235'};
holidayDb.exec(`CREATE TABLE products(${Object.entries(holidayRow).map(([key,value])=>`${key} ${typeof value==='number'?'REAL':'TEXT'}`).join(',')});`);
const saveHolidayRow = holidayDb.prepare(`INSERT INTO products VALUES(${Object.keys(holidayRow).map(()=>'?').join(',')})`);
const seedHolidayOffer = (id,title,normalized_category,changes={}) => saveHolidayRow.run(...Object.values({
  ...holidayRow,id,title,normalized_category,affiliate_url:`https://www.ebay.com/itm/${323456789000 + id}`,...changes,
}));
seedHolidayOffer(100,'Dominion Board Game', 'Toys & Games', {delivery_estimated_at:'2026-12-20T18:00:00Z'});
seedHolidayOffer(101,'Portable Espresso Machine', 'Home & Kitchen', {delivery_estimated_at:'2026-12-26T18:00:00Z', current_price:75});
seedHolidayOffer(102,'Classic Weighted Blanket', 'Home & Kitchen', {delivery_estimated_at:'2026-12-20T18:00:00Z', delivery_postal_code:'10001'});
seedHolidayOffer(103,'Bluetooth Speaker', 'Electronics', {delivery_estimated_at:'2026-12-21T18:00:00Z', availability:''});
seedHolidayOffer(104,'Holiday Watercolor Paint Set', 'Arts & Crafts', {delivery_estimated_at:'2026-12-21T18:00:00Z', delivery_postal_code:''});
seedHolidayOffer(105,'New Year Countdown Party Hats', 'Christmas & New Year');
seedHolidayOffer(106,'Silver Photo Booth Backdrop', 'Home & Kitchen');
seedHolidayOffer(107,'Gold Champagne Flutes', 'Home & Kitchen');
seedHolidayOffer(108,'Standard Christmas String Lights', 'Christmas & New Year');
seedHolidayOffer(109,'Halloween Photo Booth Backdrop', 'Home & Kitchen');
seedHolidayOffer(110,'800 PCS Mosaic Building Block Parts', 'Toys & Games');
seedHolidayOffer(111,'Hard Carrying Case for Power Banks', 'Electronics');
seedHolidayOffer(112,'Miniature Dollhouse Tableware Utensils', 'Home & Kitchen');
seedHolidayOffer(113,'Christmas Santa Hat Tableware for New Year', 'Christmas & New Year');
assert.deepEqual(getHolidayCollection(holidayDb,{q:'gift-guide',maxPrice:25}).products.map(row=>row.id).sort(),[100,102,103,104]);
assert.equal(getHolidayCollection(holidayDb,{q:'gift-guide',preview:true}).giftGroups[101],'coffee');
assert.deepEqual(getHolidayCollection(holidayDb,{q:'new-year',preview:true}).products.map(row=>row.id).sort(),[105,106,107]);
const deliveryNow = Date.parse('2026-11-27T14:00:00Z');
holidayDb.prepare('UPDATE products SET checked_at=?').run('2026-11-27T12:00:00Z');
const lastMinute = getHolidayCollection(holidayDb,{q:'last-minute',zip:'11235',now:deliveryNow});
assert.deepEqual(lastMinute.products.map(row=>row.id),[100]);
assert.deepEqual(lastMinute.arrivalDates,{100:'2026-12-20'});
assert.equal(getHolidayCollection(holidayDb,{q:'last-minute',zip:'11235',now:deliveryNow+86400000}).total,0);
assert.equal(getHolidayCollection(holidayDb,{q:'last-minute',zip:'112',now:deliveryNow}).total,0);
assert.equal(getHolidayCollection(holidayDb,{q:'last-minute',zip:'11235',market:'ca',now:deliveryNow}).total,0);
const {isNewYearSpotlight} = require('../src/holidayCatalog');
assert.equal(isNewYearSpotlight(Date.parse('2026-12-01T04:59:59Z')),false);
assert.equal(isNewYearSpotlight(Date.parse('2026-12-01T05:00:00Z')),true);
assert.equal(isNewYearSpotlight(Date.parse('2027-01-01T05:00:00Z')),false);
holidayDb.close();
console.log('Gift budgets, party themes, ZIP-specific delivery, freshness and the New Year window passed.');
