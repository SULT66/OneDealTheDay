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
test("accepts a two-product pilot and rejects unpublished products",()=>{
 const db=setup();
 const id=tv.createShow(db,{productIds:[1,2],now:time});
 const show=db.prepare("SELECT * FROM odd_tv_shows WHERE id=?").get(id);
 tv.startShow(db,id,{now:time});
 assert.equal(tv.publicShow(db,"us",time+29*60000).product.id,1);
 assert.equal(tv.publicShow(db,"us",time+30*60000).product.id,2);
 assert.throws(()=>tv.createShow(db,{productIds:[1,99]}),/PRODUCT_NOT_PUBLISHED/);
 db.close();
});
test("60-minute pilot keeps each of two products on air for 30 minutes",()=>{
 const db=setup();
 const showId=tv.createShow(db,{productIds:[1,2],now:time});
 const started=tv.startShow(db,showId,{now:time});
 assert.equal(Date.parse(started.end_at)-time,60*60000);
 assert.equal(tv.publicShow(db,"us",time).product.id,1);
 assert.equal(tv.publicShow(db,"us",time+29*60000).product.id,1);
 assert.equal(tv.publicShow(db,"us",time+30*60000).product.id,2);
 assert.equal(tv.publicShow(db,"us",time+61*60000),null);
 db.close();
});
test("only one show may be live at a time",()=>{
 const db=setup();
 const one=tv.createShow(db,{productIds:[1,2],now:time});
 tv.startShow(db,one,{now:time});
 assert.throws(()=>tv.createShow(db,{productIds:[1,2],now:time}),/ANOTHER_SHOW_ACTIVE/);
 db.close();
});
test("chat rate limits and remains queued until ACK",()=>{
 const db=setup();
 const id=tv.createShow(db,{productIds:[1,2],now:time});
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
 const id=tv.createShow(db,{productIds:[1,2],now:time});
 tv.startShow(db,id,{now:time});
 db.prepare("UPDATE products SET checked_at=? WHERE id=1").run(new Date(time-2*60*60000).toISOString());
 const at=tv.currentShow(db,"us",time+1000);
 assert.ok(at);
 const p=tv.currentProduct(db,at,time+1000).product;
 assert.equal(p.price,null);
 db.close();
});

test("scripted broadcasts wait for media, honor the schedule, and have ten minutes of live Q&A",()=>{
 const db=setup();
 const scheduled=new Date(time+45*60000).toISOString();
 const id=tv.createShow(db,{productIds:[1],scriptText:"A finished presentation for one item.",scheduledAt:scheduled,now:time});
 assert.equal(tv.startShow(db,id,{now:time}).state,"preparing");
 const work=tv.workerShow(db,"us",time);
 assert.equal(work.show.id,id);
 assert.equal(tv.publicShow(db,"us",Date.parse(scheduled)),null);
 const timing=tv.prepareScriptedShow(db,work.show,74000,time+60000);
 const questionsStart=Date.parse(timing.qna_start_at);
 assert.equal(timing.start_at,scheduled);
 assert.equal(questionsStart-Date.parse(scheduled),74000);
 assert.equal(Date.parse(timing.end_at)-questionsStart,600000);
 assert.equal(tv.publicShow(db,"us",Date.parse(scheduled)).product.id,1);
 assert.throws(()=>tv.postQuestion(db,{showId:id,sessionId:"viewer",text:"How large is it?",now:questionsStart-1}),/QUESTION_WINDOW_NOT_OPEN/);
 assert.ok(tv.postQuestion(db,{showId:id,sessionId:"viewer",text:"How large is it?",now:questionsStart}));
 assert.equal(tv.publicShow(db,"us",Date.parse(timing.end_at)),null);
 db.close();
});

test("configured runtime includes exactly ten minutes of questions and rejects a mismatched clip",()=>{
 const db=setup();
 const id=tv.createShow(db,{productIds:[1],scriptText:"An editable script at the requested duration.",scriptTarget:18,now:time});
 tv.startShow(db,id,{now:time});
 const show=tv.workerShow(db,"us",time).show;
 assert.throws(()=>tv.prepareScriptedShow(db,show,300000,time),/SCRIPT_PRESENTATION_DURATION_MISMATCH/);
 const prepared=tv.prepareScriptedShow(db,show,480000,time);
 assert.equal(Date.parse(prepared.qna_start_at)-Date.parse(prepared.start_at),8*60000);
 assert.equal(Date.parse(prepared.end_at)-Date.parse(prepared.start_at),18*60000);
 assert.throws(()=>tv.createShow(db,{productIds:[1],scriptText:"A longer edited script for a new show.",scriptTarget:10,now:time}),/SCRIPT_SHOW_DURATION_MUST_BE_11_TO_30_MINUTES/);
 db.close();
});

test("product picker ranks names above stores and tolerates typos across brands", () => {
 const { searchOddTvProducts } = require("../src/oddTvProductSearch");
 const db = new Database(":memory:");
 try {
  db.exec(`CREATE TABLE products(
    id INTEGER PRIMARY KEY, market TEXT, status TEXT, title TEXT, brand TEXT,
    retailer_name TEXT, current_price REAL, currency TEXT, image_url TEXT,
    ranking_score REAL, score REAL, updated_at TEXT, source TEXT
  )`);
  const insert = db.prepare(`
    INSERT INTO products (id,market,status,title,brand,retailer_name,ranking_score,source)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  insert.run(1, "us", "published", "Nano Portable Espresso Machine", "OutIn", "OutIn", 10, "approved");
  insert.run(2, "us", "published", "Paper Shredder", "", "Fast Premium Outlet", 100, "approved");
  insert.run(3, "us", "published", "Outdoor Power Outlet", "", "Example", 80, "approved");
  insert.run(4, "us", "published", "Wireless Earbuds", "Sony", "Example", 10, "approved");
  insert.run(5, "ca", "published", "Nano Portable Espresso Machine", "OutIn", "OutIn", 100, "approved");
  insert.run(6, "us", "draft", "Nano Portable Espresso Machine", "OutIn", "OutIn", 100, "approved");
  insert.run(7, "us", "published", "Nano Portable Espresso Machine", "OutIn", "OutIn", 100, "hidden");

  const find = query => searchOddTvProducts(db, { market:"us", query, sourceFilter:"source='approved'" }).map(row => row.id);
  assert.deepEqual(find("outin nano"), [1]);
  assert.deepEqual(find("outln nano"), [1]);
  assert.deepEqual(find("outl"), [3, 1, 2]);
  assert.deepEqual(find("outlet"), [3, 2]);
  assert.deepEqual(find("sonny wireless earbdus"), [4]);
  assert.deepEqual(find("fast premium"), [2]);
 } finally {
  db.close();
 }
});
