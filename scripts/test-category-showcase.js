const assert = require("node:assert/strict");
const {orderCategoryShowcase}=require("../src/categoryShowcase");
const now=new Date().toISOString();
const offer=(i,retailer,changes={})=>({
  id:String(i),retailer,title:"Useful home product "+i,category:"home-kitchen",
  price:42,image:"https://example.com/product.jpg",availability:"In stock",
  priceIsCurrent:true,checkedAt:now,recommendationScore:70,
  ...changes
});
const rows=[
  ...Array.from({length:40},(_,i)=>offer("e"+i,"eBay",{recommendationScore:84})),
  ...Array.from({length:20},(_,i)=>offer("o"+i,"OutIn",{recommendationScore:68})),
  ...Array.from({length:20},(_,i)=>offer("l"+i,"Lumary",{recommendationScore:68})),
];
const originalIds=rows.map(x=>x.id);
const ordered=orderCategoryShowcase(rows);
assert.deepEqual(rows.map(x=>x.id),originalIds,"original list must remain untouched");
assert.equal(ordered.length,rows.length);
assert.equal(new Set(ordered.map(x=>x.id)).size,rows.length,"no products duplicated or hidden");
const first=ordered.slice(0,24);
assert(first.filter(x=>x.retailer==="eBay").length<=8,"one store cannot dominate a three-store first page");
assert.equal(new Set(first.map(x=>x.retailer)).size,3,"quality-eligible direct shops must be visible");
const remaining=rows.filter(x=>!first.includes(x));
assert.deepEqual(ordered.slice(24),remaining,"deep pagination must keep its relative order");
const single=rows.filter(x=>x.retailer==="eBay");
assert.equal(orderCategoryShowcase(single).slice(0,24).length,24,"single-source shelves do not go empty");
const unfit=offer("bad","Budget Shop",{rating:1.8,recommendationScore:99});
const stale=offer("old","Old Shop",{priceIsCurrent:false,recommendationScore:99});
const mixed=orderCategoryShowcase([unfit,stale,...rows]);
assert(!mixed.slice(0,24).includes(unfit),"low-rated item must not receive promotion");
assert(!mixed.slice(0,24).includes(stale),"stale item must not receive promotion");
assert(mixed.includes(unfit)&&mixed.includes(stale),"excluded from spotlight, not erased from search");
console.log("Category showcase: fair first page, preserved pagination, genuine quality filters passed.");
