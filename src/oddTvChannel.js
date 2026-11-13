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
    CREATE TABLE IF NOT EXISTS odd_tv_product_presentations(
      show_id INTEGER NOT NULL REFERENCES odd_tv_shows(id),
      product_id INTEGER NOT NULL,
      presented_at TEXT NOT NULL,
      PRIMARY KEY(show_id,product_id)
    );
    CREATE TABLE IF NOT EXISTS odd_tv_broadcast_control(
      id INTEGER PRIMARY KEY CHECK(id=1),
      desired_state TEXT NOT NULL DEFAULT 'stopped' CHECK(desired_state IN ('running','stopped')),
      actual_state TEXT NOT NULL DEFAULT 'offline' CHECK(actual_state IN ('offline','starting','running','stopped','error')),
      requested_at TEXT NOT NULL,
      last_seen TEXT,
      detail TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO odd_tv_broadcast_control(id,desired_state,actual_state,requested_at)
      VALUES(1,'stopped','offline',CURRENT_TIMESTAMP);
  `);
}
function validateProducts(db,market,ids) {
  if(!Array.isArray(ids)||ids.length<8||ids.length>10||new Set(ids).size!==ids.length||
     ids.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error("REQUIRE_8_TO_10_UNIQUE_PRODUCT_IDS");
  const stmt=db.prepare("SELECT id FROM products WHERE id=? AND market=? AND status='published'");
  if(ids.some(id=>!stmt.get(id,market)))throw new Error("PRODUCT_NOT_PUBLISHED_IN_MARKET");
  return ids;
}
/**
 * Pick up to ten currently published, purchasable listings, diversifying
 * across retailers so one highly-scored marketplace does not fill the show.
 */
function pickProducts(db,market) {
  const {sourceSql}=require("./publicCatalog");
  const rows=db.prepare(
    "SELECT id,retailer_name FROM products WHERE market=? AND status='published' " +
    "AND current_price>0 AND affiliate_url IS NOT NULL AND length(trim(affiliate_url))>0 " +
    "AND " + sourceSql() +
    " ORDER BY COALESCE(ranking_score,score,0) DESC,id DESC LIMIT 150"
  ).all(market);
  const perRetailer=new Map();
  const selected=[];
  const used=new Set();
  for(const row of rows){
    const retailer=String(row.retailer_name||"unknown").toLowerCase();
    const count=perRetailer.get(retailer)||0;
    if(count>=2)continue;
    selected.push(row.id);used.add(row.id);
    perRetailer.set(retailer,count+1);
    if(selected.length===10)break;
  }
  if(selected.length<8){
    for(const row of rows){
      if(used.has(row.id))continue;
      selected.push(row.id);used.add(row.id);
      if(selected.length===10)break;
    }
  }
  if(selected.length<8)throw new Error("NOT_ENOUGH_ELIGIBLE_PRODUCTS");
  return selected;
}
function createShow(db,{market="us",productIds,now=Date.now()}) {
  const ids=validateProducts(db,market,productIds==null?pickProducts(db,market):productIds);
  const existing=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(existing)throw new Error("ANOTHER_SHOW_ACTIVE");
  const result=db.prepare(
    "INSERT INTO odd_tv_shows(market,product_ids,status,created_at) VALUES(?,?,'draft',?)"
  ).run(market,JSON.stringify(ids),new Date(now).toISOString());
  return Number(result.lastInsertRowid);
}
function startShow(db,id,{now=Date.now(),warmupMs=0}={}) {
  const show=db.prepare("SELECT * FROM odd_tv_shows WHERE id=? AND status='draft'").get(id);
  if(!show)throw new Error("SHOW_NOT_DRAFT");
  const active=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(active)throw new Error("ANOTHER_SHOW_ACTIVE");
  const start=now+Math.max(0,Math.min(10*60*1000,Number(warmupMs)||0));
  const end=start+SHOW_MINUTES*60000;
  const result=db.prepare(
    "UPDATE odd_tv_shows SET status='live',start_at=?,end_at=? WHERE id=? AND status='draft'"
  ).run(new Date(start).toISOString(),new Date(end).toISOString(),id);
  if(result.changes!==1)throw new Error("SHOW_START_RACE");
  return {show_id:id,state:start>now?"preparing":"live",start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString()};
}
function currentShow(db,market="us",now=Date.now()) {
  return db.prepare(
    "SELECT * FROM odd_tv_shows WHERE market=? AND status='live' AND start_at<=? AND end_at>? ORDER BY id DESC LIMIT 1"
  ).get(market,new Date(now).toISOString(),new Date(now).toISOString())||null;
}
function workerShow(db,market="us",now=Date.now(),lookaheadMs=10*60*1000) {
  const live=currentShow(db,market,now);
  if(live)return {show:live,opening:false};
  const nowIso=new Date(now).toISOString();
  const upcoming=db.prepare(
    "SELECT * FROM odd_tv_shows WHERE market=? AND status='live' AND start_at>? AND start_at<=? AND end_at>? ORDER BY id DESC LIMIT 1"
  ).get(market,nowIso,new Date(now+lookaheadMs).toISOString(),nowIso)||null;
  return upcoming?{show:upcoming,opening:true}:null;
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
function productPresentationDue(db,showId,productId,now=Date.now(),intervalMs=75*1000) {
  const row=db.prepare(
    "SELECT presented_at FROM odd_tv_product_presentations WHERE show_id=? AND product_id=?"
  ).get(showId,productId);
  if(!row)return true;
  const last=Date.parse(row.presented_at);
  return !Number.isFinite(last)||now-last>=intervalMs;
}
function markProductPresented(db,showId,productId,now=Date.now()) {
  const show=db.prepare("SELECT product_ids FROM odd_tv_shows WHERE id=?").get(showId);
  if(!show||!JSON.parse(show.product_ids).includes(productId))return false;
  return db.prepare(
    "INSERT INTO odd_tv_product_presentations(show_id,product_id,presented_at) VALUES(?,?,?) " +
    "ON CONFLICT(show_id,product_id) DO UPDATE SET presented_at=excluded.presented_at"
  ).run(showId,productId,new Date(now).toISOString()).changes===1;
}
function setBroadcastDesired(db,state,now=Date.now()) {
  if(!["running","stopped"].includes(state))throw new Error("INVALID_BROADCAST_STATE");
  db.prepare(
    "INSERT INTO odd_tv_broadcast_control(id,desired_state,actual_state,requested_at,last_seen,detail) " +
    "VALUES(1,?,'offline',?,NULL,'') " +
    "ON CONFLICT(id) DO UPDATE SET desired_state=excluded.desired_state,requested_at=excluded.requested_at"
  ).run(state,new Date(now).toISOString());
  return getBroadcastControl(db,now);
}
function getBroadcastControl(db,now=Date.now()) {
  const row=db.prepare("SELECT * FROM odd_tv_broadcast_control WHERE id=1").get();
  if(!row)return {desired_state:"stopped",actual_state:"offline",controller_online:false,last_seen:null,detail:""};
  const seen=Date.parse(row.last_seen||"");
  const online=Number.isFinite(seen)&&now-seen<30*1000;
  return {
    desired_state:row.desired_state,
    actual_state:online?row.actual_state:"offline",
    controller_online:online,
    last_seen:row.last_seen,
    detail:row.detail||"",
  };
}
function updateBroadcastHeartbeat(db,{state,detail=""},now=Date.now()) {
  if(!["starting","running","stopped","error"].includes(state))throw new Error("INVALID_BROADCAST_HEARTBEAT");
  db.prepare(
    "UPDATE odd_tv_broadcast_control SET actual_state=?,last_seen=?,detail=? WHERE id=1"
  ).run(state,new Date(now).toISOString(),String(detail||"").slice(0,240));
  return getBroadcastControl(db,now);
}
function markSent(db,showId,questionId,now=Date.now()) {
  return db.prepare(
    "UPDATE odd_tv_chat SET status='sent',sent_at=? WHERE id=? AND show_id=? AND status='queued'"
  ).run(new Date(now).toISOString(),questionId,showId).changes===1;
}
module.exports={SHOW_MINUTES,init,validateProducts,pickProducts,createShow,startShow,currentShow,workerShow,currentProduct,publicShow,postQuestion,messages,nextQuestion,productPresentationDue,markProductPresented,setBroadcastDesired,getBroadcastControl,updateBroadcastHeartbeat,markSent};
