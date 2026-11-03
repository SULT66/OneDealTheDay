const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {holidayPreview}=require("../src/holidayShowcase");
const {orderCategoryShowcase}=require("../src/categoryShowcase");
const now=new Date().toISOString();
const offer=(id,retailer,title,changes={})=>({id,title,retailer_name:retailer,
 source:"feed-"+retailer.toLowerCase(),market:"us",current_price:36,
 image_url:"https://example.com/item.jpg",affiliate_url:"https://example.com/item",
 availability:"In stock",checked_at:now,rating:0,review_count:0,...changes});
const rows=[
 offer(1,"AliExpress","Christmas sticker pack",{current_price:1.92}),
 offer(2,"AliExpress","Christmas Pillowcase",{current_price:9.99}),
 offer(3,"AliExpress","Christmas Garland Decoration"),
 offer(4,"AliExpress","Christmas Tree"),
 offer(5,"AliExpress","Christmas Ornament Set"),
 offer(6,"OutIn","Christmas Espresso Coffee Maker"),
 offer(7,"Lumary","Christmas Smart Outdoor Lights"),
 offer(8,"Grommet","Christmas Party Gift Box"),
 offer(9,"TideWe","New Year Party Decoration"),
 offer(10,"Giftlab","Christmas Photo Gift"),
 offer(11,"AliExpress","Christmas LED Curtain Lights"),
 offer(12,"AliExpress","Christmas Table Wreath"),
];
const featured=holidayPreview(rows,8);
assert(!featured.some(p=>/sticker|pillowcase/i.test(p.title)),"cheap accessories must not lead seasonal homepage");
assert(featured.length>=5,"a varied holiday shelf should not become empty");
assert(new Set(featured.map(p=>p.retailer_name)).size>=4,"several qualified partners must appear");
assert(featured.filter(p=>p.retailer_name==="AliExpress").length<=3,"fallback may use one more qualified item when other shops cannot fill all eight positions");
assert.equal(rows.length,12,"full catalog remains intact");
const defaultPage=orderCategoryShowcase(rows);
assert.equal(defaultPage.length,rows.length);
const campaign=fs.readFileSync(path.join(__dirname,"../components/site/HomeCampaigns.tsx"),"utf8");
assert(!/OUTLN/.test(campaign),"Campaign text must use the exact OutIn spelling");
assert(/key:"outin",eyebrow:"OutIn"/.test(campaign));
console.log("Holiday spotlight and OutIn banner: quality, shop mix and consistent brand passed.");
