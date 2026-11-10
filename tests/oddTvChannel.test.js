"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const Database=require("better-sqlite3");
const tv=require("../src/oddTvChannel");
const time=Date.parse("2026-11-10T20:00:00Z");
function setup(){
 const db=new Database(":memory:");
 db.exec("CREATE TABLE products(id INTEGER PRIMARY KEY,market TEXT,status TEXT,title TEXT,brand TEXT,retailer_name TEXT,description TEXT,current_price REAL,currency TEXT,checked_at TEXT,image_url TEXT,affiliate_url TEXT,availability TEXT)");
 for(let i=1;i<=10;i++)db.prepare("INSERT INTO products VALUES(?, 'us', 'published', ?, 'Demo', 'Store', 'Listing description', 29.99, 'USD', ?, '', '', 'unknown')").run(i,"Product "+i,new Date(time).toISOString());
 tv.init(db);
 return db;
}
test("requires 8 to 10 existing published products",()=>{
 const db=setup();
 assert.throws(()=>tv.createShow(db,{productIds:[1,2]}),/REQUIRE_8/);
 assert.throws(()=>tv.createShow(db,{productIds:[1,2,3,4,5,6,7,99]}),/PRODUCT_NOT_PUBLISHED/);
 db.close();
});
test("60-minute program rotates through 8 products",()=>{
 const db=setup();
 const showId=tv.createShow(db,{productIds:[1,2,3,4,5,6,7,8],now:time});
 const started=tv.startShow(db,showId,{now:time});
 assert.equal(Date.parse(started.end_at)-time,60*60000);
 assert.equal(tv.publicShow(db,"us",time).product.id,1);
 assert.equal(tv.publicShow(db,"us",time+59*60000).product.id,8);
 assert.equal(tv.publicShow(db,"us",time+61*60000),null);
 db.close();
});
test("only one show may be live at a time",()=>{
 const db=setup();
 const one=tv.createShow(db,{productIds:[1,2,3,4,5,6,7,8],now:time});
 tv.startShow(db,one,{now:time});
 assert.throws(()=>tv.createShow(db,{productIds:[1,2,3,4,5,6,7,8],now:time}),/ANOTHER_SHOW_ACTIVE/);
 db.close();
});
test("chat rate limits and remains queued until ACK",()=>{
 const db=setup();
 const id=tv.createShow(db,{productIds:[1,2,3,4,5,6,7,8],now:time});
 tv.startShow(db,id,{now:time});
 const q=tv.postQuestion(db,{showId:id,sessionId:"safe-session",text:"Is this BPA free?",now:time});
 assert.equal(tv.nextQuestion(db,id).id,q);
 assert.throws(()=>tv.postQuestion(db,{showId:id,sessionId:"safe-session",text:"Another?",now:time+1000}),/CHAT_RATE_LIMIT/);
 assert.equal(tv.messages(db,id).length,1);
 assert.equal(tv.markSent(db,id,q,time+1000),true);
 assert.equal(tv.markSent(db,id,q,time+2000),false);
 assert.equal(tv.nextQuestion(db,id),null);
 db.close();
});
test("stale product price is not spoken as current",()=>{
 const db=setup();
 const id=tv.createShow(db,{productIds:[1,2,3,4,5,6,7,8],now:time});
 tv.startShow(db,id,{now:time});
 const at=tv.currentShow(db,"us",time+61*60000-60000);
 assert.ok(at);
 const p=tv.currentProduct(db,at,time+61*60000-60000).product;
 assert.equal(p.price,null);
 db.close();
});
