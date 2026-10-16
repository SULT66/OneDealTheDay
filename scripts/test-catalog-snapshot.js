const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const {catalogSnapshot} = require("../src/catalogSnapshot");
const {uniqueProductsInOrder} = require("../src/publicCatalog");
const {presentListingProduct, presentProduct} = require("../src/productPresentation");
const db = new Database(":memory:");
db.exec("CREATE TABLE products(id INTEGER, market TEXT, source TEXT, retailer_name TEXT, title TEXT, normalized_category TEXT, score REAL, ranking_score REAL, updated_at TEXT)");
const rows = [
  [1,"us","ebay","eBay","Keurig Coffee Maker Black","Home & Kitchen",80,70,"2026-10-15"],
  [2,"us","ebay","eBay","Keurig Coffee Maker Black","Home & Kitchen",75,90,"2026-10-14"],
  [3,"us","ebay","eBay","Lenovo ThinkPad Laptop","Electronics",90,80,"2026-10-16"],
  [4,"us","aliexpress","AliExpress","Useful USB Hub Adapter","Electronics",70,60,"2026-10-16"],
  [5,"us","feed-newegg","Newegg","Keurig Coffee Maker Black","Home & Kitchen",null,null,"2026-10-16"],
];
const insert=db.prepare("INSERT INTO products VALUES(?,?,?,?,?,?,?,?,?)");
for(const row of rows)insert.run(...row);
const raw=db.prepare("SELECT * FROM products").all();
assert.deepEqual(uniqueProductsInOrder(raw,2),uniqueProductsInOrder(raw).slice(0,2),"small shelves must stop once filled without changing duplicate choices");
for(const category of ["","Electronics","Home & Kitchen","Absent"]){
  for(const ranking of [true,false]){
    const order=ranking?"COALESCE(ranking_score,score) DESC,score DESC,updated_at DESC":"score DESC,updated_at DESC";
    const expected=uniqueProductsInOrder(db.prepare(`SELECT * FROM products ${category?"WHERE normalized_category=?":""} ORDER BY ${order}`).all(...(category?[category]:[])));
    assert.deepEqual(catalogSnapshot(raw,{category,ranking}),expected,"snapshot must preserve the existing SQL ordering, category scope and duplicate rules");
  }
}
assert.strictEqual(catalogSnapshot(raw),catalogSnapshot(raw),"navigation and facets must reuse the same deduplicated snapshot");
const replaced=raw.map(p=>p.id===3?{...p,title:"Updated Lenovo Laptop"}:p);
assert(catalogSnapshot(replaced).some(p=>p.title==="Updated Lenovo Laptop"),"new raw rows must invalidate old views");
assert(!catalogSnapshot(raw).some(p=>p.title==="Updated Lenovo Laptop"));
db.close();

for(const language of ["en","es","fr","de","ru","az"]){
  for(const source of ["ebay","feed-newegg","aliexpress"]){
    for(const age of [0,48]){
      const product={id:1,market:"us",source,retailer_name:source==="ebay"?"eBay":source==="aliexpress"?"AliExpress":"Newegg",
        title:"Keurig Coffee Maker",normalized_category:"Home & Kitchen",current_price:75.95,original_price:99.99,currency:"USD",
        checked_at:new Date(Date.now()-age*3600000).toISOString(),rating:4.8,review_count:83,seller_rating:99.7,seller_feedback_count:12345,
        shipping_summary:"Free shipping",return_summary:"30-day returns",availability:"In stock",image_url:"https://example.com/coffee.jpg",
        affiliate_url:"https://www.ebay.com/itm/123456789?campid=5339179772",score:80,score_breakdown:"{}"};
      const listing=presentListingProduct(product,language),full=presentProduct(product,language);
      for(const key of Object.keys(listing))assert.deepEqual(listing[key],full[key],`compact ${key} differs from full presentation (${language}/${source}/${age})`);
    }
  }
}
console.log("Shared catalogue snapshots preserve SQL ordering, scope, deduplication and refresh; compact fields match full presentation.");
