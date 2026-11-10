"use strict";
const {chatMessageInput,viewerTag} = require("./liveHost");

const SHOW_MINUTES=60;
function init(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS odd_tv_shows(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL,
      product_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','live','ended')),
      start_at TEXT,
      end_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_odd_tv_market_status ON odd_tv_shows(market,status);
    CREATE TABLE IF NOT EXISTS odd_tv_chat(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES odd_tv_shows(id),
      session_id TEXT NOT NULL,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sent','hidden')),
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_odd_tv_chat_queue ON odd_tv_chat(show_id,status,id);
  `);
}
function validateProducts(db,market,ids) {
  if(!Array.isArray(ids)||ids.length<8||ids.length>10||new Set(ids).size!==ids.length||
     ids.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error("REQUIRE_8_TO_10_UNIQUE_PRODUCT_IDS");
  const stmt=db.prepare("SELECT id FROM products WHERE id=? AND market=? AND status='published'");
  if(ids.some(id=>!stmt.get(id,market)))throw new Error("PRODUCT_NOT_PUBLISHED_IN_MARKET");
  return ids;
}
function createShow(db,{market="us",productIds,now=Date.now()}) {
  const ids=validateProducts(db,market,productIds);
  const existing=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(existing)throw new Error("ANOTHER_SHOW_ACTIVE");
  const result=db.prepare(
    "INSERT INTO odd_tv_shows(market,product_ids,status,created_at) VALUES(?,?,'draft',?)"
  ).run(market,JSON.stringify(ids),new Date(now).toISOString());
  return Number(result.lastInsertRowid);
}
function startShow(db,id,{now=Date.now()}={}) {
  const show=db.prepare("SELECT * FROM odd_tv_shows WHERE id=? AND status='draft'").get(id);
  if(!show)throw new Error("SHOW_NOT_DRAFT");
  const active=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(active)throw new Error("ANOTHER_SHOW_ACTIVE");
  const end=now+SHOW_MINUTES*60000;
  const result=db.prepare(
    "UPDATE odd_tv_shows SET status='live',start_at=?,end_at=? WHERE id=? AND status='draft'"
  ).run(new Date(now).toISOString(),new Date(end).toISOString(),id);
  if(result.changes!==1)throw new Error("SHOW_START_RACE");
  return {show_id:id,start_at:new Date(now).toISOString(),end_at:new Date(end).toISOString()};
}
function currentShow(db,market="us",now=Date.now()) {
  return db.prepare(
    "SELECT * FROM odd_tv_shows WHERE market=? AND status='live' AND start_at<=? AND end_at>? ORDER BY id DESC LIMIT 1"
  ).get(market,new Date(now).toISOString(),new Date(now).toISOString())||null;
}
function currentProduct(db,show,now=Date.now()) {
  const ids=JSON.parse(show.product_ids);
  const start=Date.parse(show.start_at);
  const elapsed=Math.min(SHOW_MINUTES*60000-1,Math.max(0,now-start));
  const index=Math.min(ids.length-1,Math.floor(elapsed/(SHOW_MINUTES*60000/ids.length)));
  const product=db.prepare(
    "SELECT id,title,brand,retailer_name,description,current_price,currency,checked_at,image_url,affiliate_url,availability FROM products WHERE id=? AND market=? AND status='published'"
  ).get(ids[index],show.market);
  if(!product)return {index,product:null};
  const checked=Date.parse(product.checked_at||"");
  const priceVerified=Number.isFinite(checked) && now-checked<60*60000 && now>=checked;
  return {index,product:{
    id:product.id,title:product.title,brand:product.brand,
    retailer_name:product.retailer_name,description:product.description,
    price:priceVerified?product.current_price:null,currency:product.currency,
    image_url:product.image_url,affiliate_url:product.affiliate_url,
    stock_status:"unknown",
    price_verified:priceVerified
  }};
}
function publicShow(db,market,now=Date.now()) {
  const show=currentShow(db,market,now);
  if(!show)return null;
  const {index,product}=currentProduct(db,show,now);
  return {
    show_id:show.id,state:"live",market:show.market,
    start_at:show.start_at,end_at:show.end_at,
    product_index:index+1,product_count:JSON.parse(show.product_ids).length,
    product,
  };
}
function postQuestion(db,{showId,sessionId,text,now=Date.now()}) {
  const checked=chatMessageInput(text);
  if(checked.error)throw new Error(checked.error);
  if(!sessionId||sessionId.length>128)throw new Error("INVALID_SESSION");
  const recent=db.prepare(
    "SELECT created_at FROM odd_tv_chat WHERE show_id=? AND session_id=? ORDER BY id DESC LIMIT 1"
  ).get(showId,sessionId);
  if(recent&&now-Date.parse(recent.created_at)<8000)throw new Error("CHAT_RATE_LIMIT");
  const queued=db.prepare(
    "SELECT COUNT(*) AS n FROM odd_tv_chat WHERE show_id=? AND session_id=? AND status='queued'"
  ).get(showId,sessionId).n;
  if(queued>=3)throw new Error("CHAT_QUEUE_FULL");
  const inserted=db.prepare(
    "INSERT INTO odd_tv_chat(show_id,session_id,author,text,status,created_at) VALUES(?,?,?,?,'queued',?)"
  ).run(showId,sessionId,viewerTag(sessionId),checked.text,new Date(now).toISOString());
  return Number(inserted.lastInsertRowid);
}
function messages(db,showId,after=0) {
  return db.prepare(
    "SELECT id,author,text,status,created_at FROM odd_tv_chat WHERE show_id=? AND id>? AND status!='hidden' ORDER BY id DESC LIMIT 50"
  ).all(showId,Math.max(0,Number(after)||0)).reverse();
}
function nextQuestion(db,showId) {
  return db.prepare("SELECT id,text FROM odd_tv_chat WHERE show_id=? AND status='queued' ORDER BY id ASC LIMIT 1").get(showId)||null;
}
function markSent(db,showId,questionId,now=Date.now()) {
  return db.prepare(
    "UPDATE odd_tv_chat SET status='sent',sent_at=? WHERE id=? AND show_id=? AND status='queued'"
  ).run(new Date(now).toISOString(),questionId,showId).changes===1;
}
module.exports={SHOW_MINUTES,init,validateProducts,createShow,startShow,currentShow,currentProduct,publicShow,postQuestion,messages,nextQuestion,markSent};
