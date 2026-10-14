const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
process.env.PUBLIC_PRODUCT_SOURCES='ebay';
process.env.EBAY_CLIENT_ID='collection-test';process.env.EBAY_CLIENT_SECRET='collection-test';process.env.EBAY_CAMPAIGN_ID='5339179772';
const {getHalloweenCollection,runMerchandising,getMerchandisingShelves}=require('../src/merchandising');
const now=Date.parse('2026-10-14T18:00:00Z'),iso=n=>new Date(n).toISOString(),DAY=86400000;
const sample={id:5000,title:'Halloween Decoration Model 5000',market:'us',currency:'USD',source:'ebay',retailer_name:'eBay',status:'published',current_price:20,
  checked_at:iso(now-1000),image_url:'https://i.ebayimg.com/decoration.jpg',affiliate_url:'https://www.ebay.com/itm/123456789000',
  availability:'In stock',shipping_summary:'Free shipping',return_summary:'30 day returns accepted',rating:4.7,review_count:30,seller_rating:99.5,seller_feedback_count:400,
  category:'Home',delivery_estimated_at:iso(now+3*DAY),delivery_country:'US',ebay_sold_quantity:0};
const native=new DatabaseSync(':memory:');
native.exec(`CREATE TABLE products(${Object.entries(sample).map(([key,value])=>`${key} ${typeof value==='number'?'REAL':'TEXT'}`).join(',')})`);
const db={exec:sql=>native.exec(sql),prepare:sql=>native.prepare(sql)};
const insert=native.prepare(`INSERT INTO products VALUES(${Object.keys(sample).map(()=>'?').join(',')})`);
for(let i=0;i<210;i++) {const p={...sample,id:5000+i,title:`Halloween Decoration Model ${5000+i}`,affiliate_url:`https://www.ebay.com/itm/${123456789000+i}`,current_price:20+i,ebay_sold_quantity:i===1?150:null};insert.run(...Object.values(p));}
const first=getHalloweenCollection(db,{now});
assert.equal(first.total,200);assert.equal(first.products.length,24);assert.equal(first.pages,9);
const second=getHalloweenCollection(db,{now,page:2});
assert(!second.products.some(p=>first.products.some(f=>f.id===p.id)),'Pages must not repeat products');
assert(first.products.some(p=>first.selectionEvidence[p.id].ebaySoldQuantity===null),'General catalogue can include unknown sales without inventing evidence');
assert.equal(getHalloweenCollection(db,{now,q:'Model 5008'}).total,1);
const sorted=getHalloweenCollection(db,{now,sort:'price-desc'}).products;
assert(sorted.every((p,i)=>!i || sorted[i-1].current_price>=p.current_price));
assert.equal(getHalloweenCollection(db,{now,page:999}).page,9);
native.prepare("UPDATE products SET title='Unrelated computer desk' WHERE id=5008").run();
assert.equal(getHalloweenCollection(db,{now,q:'5008'}).total,0);
native.prepare("UPDATE products SET availability='Out of stock' WHERE id=5009").run();
assert.equal(getHalloweenCollection(db,{now,q:'5009'}).total,0);
native.prepare('UPDATE products SET checked_at=? WHERE id=5010').run(iso(now-3*DAY));
assert.equal(getHalloweenCollection(db,{now,q:'5010'}).total,0);
native.prepare('UPDATE products SET delivery_estimated_at=? WHERE id=5011').run(iso(now+20*DAY));
assert.equal(getHalloweenCollection(db,{now,q:'5011'}).total,0);
assert.equal(getHalloweenCollection(db,{now:Date.parse('2026-10-24T04:00:00Z')}).active,false);
(async()=>{await runMerchandising(db,{now});const shelves=getMerchandisingShelves(db,{now});
  assert.equal(shelves[0].products.length,1,'Sales-backed homepage must still reject unproven sales');
  assert.equal(shelves[0].products[0].id,5001);native.close();
  console.log('Halloween collection: 200-item cap, paging, search, price sorting, buying checks, cutoff and sales-backed pick isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
