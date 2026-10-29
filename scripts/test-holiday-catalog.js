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
