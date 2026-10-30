const assert = require('node:assert/strict');
const {recommendationScore, discoveryOrder, discoveryEligible} = require('../src/discoveryRanking');
const base = {id:'1',title:'Portable Coffee Maker Gift',source:'feed-shop',retailer_name:'Shop',
  current_price:60,image_url:'https://example.com/a.jpg',availability:'In stock'};
assert.equal(recommendationScore(base), recommendationScore({...base,source:'ebay',retailer_name:'eBay'}));
assert.equal(recommendationScore(base), recommendationScore({...base,original_price:9999}), 'list prices must not buy ranking points');
assert.ok(recommendationScore({...base,average_30_day_price:90}) > recommendationScore(base));
assert.ok(recommendationScore({...base,average_30_day_price:40}) < recommendationScore(base));
assert.ok(recommendationScore({...base,rating:4.8,review_count:200}) - recommendationScore(base) <= 5);
assert.ok(!discoveryEligible({...base,rating:2}));
assert.ok(!discoveryEligible({...base,display_price_is_current:false}));
assert.ok(!discoveryEligible({...base,seller_rating:90}));
const rows=Array.from({length:60},(_,i)=>({...base,id:String(i),title:`Useful household product ${i}`,
  retailer_name:['eBay','Direct shop','Another shop'][Math.floor(i/20)],category:`category-${i%6}`}));
const ordered=discoveryOrder(rows);
assert.equal(ordered.length,rows.length);
assert.equal(new Set(ordered.map(p=>p.id)).size,rows.length,'pagination must not lose or duplicate offers');
assert.equal(ordered.slice(0,12).filter(p=>p.retailer_name==='eBay').length,4);
assert.deepEqual(ordered,discoveryOrder(rows),'pagination order must be deterministic');
assert.deepEqual(rows.map(p=>p.id),Array.from({length:60},(_,i)=>String(i)),'ranking must not mutate the input');
assert.ok(ordered.every(p=>p.rating===undefined),'ranking must not fabricate reviews');
console.log('Discovery ranking: neutral missing evidence, source neutrality, price evidence, diversity and pagination passed.');
const Database = require('better-sqlite3');
const {discoveryHistory} = require('../src/discoveryHistory');
const db = new Database(':memory:');
db.exec(`CREATE TABLE products(id INTEGER,market TEXT,status TEXT,currency TEXT);
CREATE TABLE price_history(product_id INTEGER,price REAL,observed_at TEXT,currency TEXT);
INSERT INTO products VALUES(1,'us','published','USD'),(2,'ca','published','CAD');
INSERT INTO price_history VALUES(1,80,'2026-10-28T12:00:00Z','USD'),(1,60,'2026-10-29T12:00:00Z','USD'),
(1,999,'2026-10-29T13:00:00Z','EUR'),(2,999,'2026-10-29T12:00:00Z','CAD');`);
const enriched=discoveryHistory(db,[{...base,id:1}],'us',Date.parse('2026-10-29T15:00:00Z'));
assert.equal(enriched[0].average_30_day_price,70,'ranking must use actual observations in the matching currency/market');
assert.ok(recommendationScore(enriched[0])>recommendationScore(base));
db.close();
console.log('Discovery history: batched recorded-price context and market/currency isolation passed.');

const established = Array.from({length:20},(_,i)=>({...base,id:`est-${i}`,title:`Useful household gadget ${i}`,category:`cat-${i}`,retailer_name:'eBay',
  rating:4.8,review_count:200,seller_rating:4.95,shipping_summary:'Free shipping',return_summary:'30-day returns'}));
const newShops=['OutIn','Lumary','Grommet','Giftlab'].map((retailer_name,i)=>({...base,id:`new-${i}`,title:`Useful household gift ${i}`,category:`gift-${i}`,retailer_name}));
assert.ok(new Set(discoveryOrder([...established,...newShops]).slice(0,4).map(p=>p.retailer_name)).size>1,
  'even a strong data-rich retailer must not occupy the entire first desktop row');
