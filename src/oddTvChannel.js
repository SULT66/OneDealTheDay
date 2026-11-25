"use strict";
const crypto = require("crypto");
const CHAT_MAX_LENGTH = 200;
function chatMessageInput(value) {
  const text=String(value||"").replace(/[\x00-\x1f\x7f]+/g," ").replace(/\s+/g," ").trim();
  if(text.length<2)return {error:"Type a question first."};
  if(text.length>CHAT_MAX_LENGTH)return {error:"Keep it under 200 characters."};
  if(/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|ru|xyz|shop|link|ly)\b)/i.test(text))return {error:"Links can't be posted in the chat."};
  return {text};
}
function viewerTag(sessionId) {
  const digest=crypto.createHash("sha256").update(String(sessionId||"")).digest("hex");
  return `Viewer ${digest.slice(0,4).toUpperCase()}`;
}

const SHOW_MINUTES=60;
const PILOT_MINUTES=6;
const PILOT_QNA_START_SECONDS=180;
const PILOT_MAX_QUESTIONS=5;
const SCRIPT_QNA_MS=10*60*1000;
const SCRIPT_MIN_MINUTES=11;
const SCRIPT_MAX_MINUTES=30;
const SCRIPT_MAX_CHARS=24000;
function init(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS odd_tv_shows(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL,
      product_ids TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','live','ended')),
      start_at TEXT,
      end_at TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      pilot_mode INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS odd_tv_viewers(
      show_id INTEGER NOT NULL REFERENCES odd_tv_shows(id),
      session_hash TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      PRIMARY KEY(show_id,session_hash)
    );
    CREATE INDEX IF NOT EXISTS idx_odd_tv_viewers_seen ON odd_tv_viewers(show_id,last_seen);
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
  if(!db.pragma("table_info(odd_tv_chat)").some(column=>column.name==="product_id"))
    db.exec("ALTER TABLE odd_tv_chat ADD COLUMN product_id INTEGER");
  if(!db.pragma("table_info(odd_tv_shows)").some(column=>column.name==="duration_minutes"))
    db.exec("ALTER TABLE odd_tv_shows ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60");
  if(!db.pragma("table_info(odd_tv_shows)").some(column=>column.name==="pilot_mode"))
    db.exec("ALTER TABLE odd_tv_shows ADD COLUMN pilot_mode INTEGER NOT NULL DEFAULT 0");
  const columns=new Set(db.pragma("table_info(odd_tv_shows)").map(column=>column.name));
  for(const column of ["script_text","scheduled_at","qna_start_at","script_error"]){
    if(!columns.has(column))db.exec(`ALTER TABLE odd_tv_shows ADD COLUMN ${column} TEXT`);
  }
  if(!columns.has("script_target_minutes"))db.exec("ALTER TABLE odd_tv_shows ADD COLUMN script_target_minutes INTEGER");
}
function scriptTargetMinutes(value) {
  if(!Number.isInteger(value)||value<SCRIPT_MIN_MINUTES||value>SCRIPT_MAX_MINUTES)
    throw new Error("SCRIPT_SHOW_DURATION_MUST_BE_11_TO_30_MINUTES");
  return value;
}
function validateProducts(db,market,ids,{pilotMode=false,scripted=false}={}) {
  const expected=pilotMode||scripted?1:2;
  if(!Array.isArray(ids)||ids.length!==expected||new Set(ids).size!==ids.length||
     ids.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error(scripted?"SCRIPT_REQUIRES_ONE_PRODUCT":pilotMode?"PILOT_REQUIRES_EXACTLY_ONE_PRODUCT_ID":"REQUIRE_EXACTLY_TWO_UNIQUE_PRODUCT_IDS");
  const stmt=db.prepare("SELECT id FROM products WHERE id=? AND market=? AND status='published'");
  if(ids.some(id=>!stmt.get(id,market)))throw new Error("PRODUCT_NOT_PUBLISHED_IN_MARKET");
  return ids;
}
/**
 * Pick two currently published, purchasable listings from different
 * retailers when possible for the 30/30 pilot.
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
    if(selected.length===2)break;
  }
  if(selected.length<2){
    for(const row of rows){
      if(used.has(row.id))continue;
      selected.push(row.id);used.add(row.id);
      if(selected.length===2)break;
    }
  }
  if(selected.length<2)throw new Error("NOT_ENOUGH_ELIGIBLE_PRODUCTS");
  return selected;
}
function createShow(db,{market="us",productIds,pilotMode=false,scriptText=null,scheduledAt=null,scriptTarget=null,now=Date.now()}) {
  if(typeof pilotMode!=="boolean")throw new Error("INVALID_PILOT_MODE");
  const scripted=scriptText!==null;
  if(scripted&&(pilotMode||typeof scriptText!=="string"||scriptText.trim().length<20||scriptText.length>SCRIPT_MAX_CHARS))
    throw new Error("SCRIPT_MUST_BE_20_TO_24000_CHARACTERS");
  if(scriptTarget!==null){
    if(!scripted)throw new Error("SCRIPT_REQUIRED_FOR_DURATION");
    scriptTargetMinutes(scriptTarget);
  }
  if(scheduledAt!==null&&(!scripted||typeof scheduledAt!=="string"||!Number.isFinite(Date.parse(scheduledAt))||Date.parse(scheduledAt)<now))
    throw new Error("START_TIME_MUST_BE_IN_THE_FUTURE");
  const ids=validateProducts(db,market,productIds==null&&!scripted?pickProducts(db,market):productIds,{pilotMode,scripted});
  const existing=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(existing)throw new Error("ANOTHER_SHOW_ACTIVE");
  const durationMinutes=pilotMode?PILOT_MINUTES:SHOW_MINUTES;
  const result=db.prepare(
    "INSERT INTO odd_tv_shows(market,product_ids,duration_minutes,pilot_mode,status,created_at,script_text,scheduled_at,script_target_minutes) VALUES(?,?,?,?, 'draft',?,?,?,?)"
  ).run(market,JSON.stringify(ids),durationMinutes,pilotMode?1:0,new Date(now).toISOString(),scripted?scriptText.trim():null,scheduledAt,scriptTarget);
  return Number(result.lastInsertRowid);
}
function startShow(db,id,{now=Date.now(),warmupMs=0}={}) {
  const show=db.prepare("SELECT * FROM odd_tv_shows WHERE id=? AND status='draft'").get(id);
  if(!show)throw new Error("SHOW_NOT_DRAFT");
  const active=db.prepare("SELECT id FROM odd_tv_shows WHERE status='live' AND end_at>? LIMIT 1")
    .get(new Date(now).toISOString());
  if(active)throw new Error("ANOTHER_SHOW_ACTIVE");
  const start=show.script_text
    ? Math.max(now+10000,Date.parse(show.scheduled_at||"")||0)
    : now+Math.max(0,Math.min(10*60*1000,Number(warmupMs)||0));
  const durationMinutes=Math.max(1,Math.min(SHOW_MINUTES,Number(show.duration_minutes)||SHOW_MINUTES));
  const end=start+durationMinutes*60000;
  const result=db.prepare(
    "UPDATE odd_tv_shows SET status='live',start_at=?,end_at=? WHERE id=? AND status='draft'"
  ).run(new Date(start).toISOString(),new Date(end).toISOString(),id);
  if(result.changes!==1)throw new Error("SHOW_START_RACE");
  return {show_id:id,state:start>now?"preparing":"live",start_at:new Date(start).toISOString(),end_at:new Date(end).toISOString()};
}
function prepareScriptedShow(db,show,durationMs,now=Date.now()) {
  const target=show.script_target_minutes?show.script_target_minutes*60000-SCRIPT_QNA_MS:null;
  if(!show.script_text||show.status!=="live"||!Number.isInteger(durationMs)||durationMs<1000||durationMs>(target??5*60*1000)+1000)
    throw new Error("INVALID_SCRIPT_PRESENTATION_DURATION");
  if(target!==null&&Math.abs(durationMs-target)>1000)throw new Error("SCRIPT_PRESENTATION_DURATION_MISMATCH");
  if(show.qna_start_at)return {start_at:show.start_at,qna_start_at:show.qna_start_at,end_at:show.end_at};
  const start=Math.max(now+10000,Date.parse(show.scheduled_at||"")||0);
  const startAt=new Date(start).toISOString();
  const qnaAt=new Date(start+(target??durationMs)).toISOString();
  const endAt=new Date(Date.parse(qnaAt)+SCRIPT_QNA_MS).toISOString();
  const result=db.prepare("UPDATE odd_tv_shows SET start_at=?,qna_start_at=?,end_at=? WHERE id=? AND status='live' AND qna_start_at IS NULL")
    .run(startAt,qnaAt,endAt,show.id);
  if(result.changes!==1)throw new Error("SHOW_PREPARATION_RACE");
  return {start_at:startAt,qna_start_at:qnaAt,end_at:endAt};
}
function currentShow(db,market="us",now=Date.now()) {
  return db.prepare(
    "SELECT * FROM odd_tv_shows WHERE market=? AND status='live' AND start_at<=? AND end_at>? AND (script_text IS NULL OR qna_start_at IS NOT NULL) ORDER BY id DESC LIMIT 1"
  ).get(market,new Date(now).toISOString(),new Date(now).toISOString())||null;
}
function workerShow(db,market="us",now=Date.now(),lookaheadMs=10*60*1000) {
  const live=currentShow(db,market,now);
  if(live)return {show:live,opening:false};
  const nowIso=new Date(now).toISOString();
  const upcoming=db.prepare(
    "SELECT * FROM odd_tv_shows WHERE market=? AND status='live' AND ((script_text IS NOT NULL AND qna_start_at IS NULL) OR (start_at>? AND start_at<=?)) AND end_at>? ORDER BY id DESC LIMIT 1"
  ).get(market,nowIso,new Date(now+lookaheadMs).toISOString(),nowIso)||null;
  return upcoming?{show:upcoming,opening:true}:null;
}
function productById(db,show,productId,now=Date.now()) {
  const ids=JSON.parse(show.product_ids);
  const index=ids.indexOf(Number(productId));
  if(index<0)return {index:-1,product:null};
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
function currentProduct(db,show,now=Date.now()) {
  const ids=JSON.parse(show.product_ids);
  const start=Date.parse(show.start_at);
  const durationMs=Math.max(1,Math.min(SHOW_MINUTES,Number(show.duration_minutes)||SHOW_MINUTES))*60000;
  const elapsed=Math.min(durationMs-1,Math.max(0,now-start));
  const index=Math.min(ids.length-1,Math.floor(elapsed/(durationMs/ids.length)));
  return productById(db,show,ids[index],now);
}
function activeViewerCount(db,showId,now=Date.now(),ttlMs=45*1000) {
  const cutoff=new Date(now-ttlMs).toISOString();
  db.prepare("DELETE FROM odd_tv_viewers WHERE show_id=? AND last_seen<?").run(showId,cutoff);
  return Number(db.prepare("SELECT COUNT(*) AS n FROM odd_tv_viewers WHERE show_id=? AND last_seen>=?")
    .get(showId,cutoff).n)||0;
}
function publicShow(db,market,now=Date.now()) {
  const show=currentShow(db,market,now);
  if(!show)return null;
  const {index,product}=currentProduct(db,show,now);
  return {
    show_id:show.id,state:"live",market:show.market,
    start_at:show.start_at,end_at:show.end_at,
    qna_start_at:show.qna_start_at||null,
    seconds_remaining:Math.max(0,Math.ceil((Date.parse(show.end_at)-now)/1000)),
    viewer_count:activeViewerCount(db,show.id,now),
    server_now:new Date(now).toISOString(),
    product_index:index+1,product_count:JSON.parse(show.product_ids).length,
    product,
  };
}
function postQuestion(db,{showId,sessionId,text,productId=null,now=Date.now()}) {
  const checked=chatMessageInput(text);
  if(checked.error)throw new Error(checked.error);
  if(!sessionId||sessionId.length>128)throw new Error("INVALID_SESSION");
  const show=db.prepare("SELECT product_ids,start_at,end_at,pilot_mode,script_text,qna_start_at FROM odd_tv_shows WHERE id=?").get(showId);
  if(!show)throw new Error("SHOW_NOT_FOUND");
  if(productId!==null&&!JSON.parse(show.product_ids).includes(Number(productId)))
    throw new Error("INVALID_PRODUCT_FOR_SHOW");
  if(show.script_text&&(!show.qna_start_at||now<Date.parse(show.qna_start_at)))throw new Error("QUESTION_WINDOW_NOT_OPEN");
  if(show.script_text&&now>=Date.parse(show.end_at))throw new Error("SHOW_ENDED");
  if(show.pilot_mode){
    const startsAt=Date.parse(show.start_at||"");
    if(!Number.isFinite(startsAt)||now<startsAt+PILOT_QNA_START_SECONDS*1000)
      throw new Error("QUESTION_WINDOW_NOT_OPEN");
    if(now>=Date.parse(show.end_at||""))throw new Error("SHOW_ENDED");
    const total=db.prepare("SELECT COUNT(*) AS n FROM odd_tv_chat WHERE show_id=?").get(showId).n;
    if(total>=PILOT_MAX_QUESTIONS)throw new Error("PILOT_QUESTION_LIMIT_REACHED");
  }
  const recent=db.prepare(
    "SELECT created_at FROM odd_tv_chat WHERE show_id=? AND session_id=? ORDER BY id DESC LIMIT 1"
  ).get(showId,sessionId);
  if(recent&&now-Date.parse(recent.created_at)<8000)throw new Error("CHAT_RATE_LIMIT");
  const queued=db.prepare(
    "SELECT COUNT(*) AS n FROM odd_tv_chat WHERE show_id=? AND session_id=? AND status='queued'"
  ).get(showId,sessionId).n;
  if(queued>=3)throw new Error("CHAT_QUEUE_FULL");
  const inserted=db.prepare(
    "INSERT INTO odd_tv_chat(show_id,session_id,author,text,status,created_at,product_id) VALUES(?,?,?,?,'queued',?,?)"
  ).run(showId,sessionId,viewerTag(sessionId),checked.text,new Date(now).toISOString(),productId===null?null:Number(productId));
  return Number(inserted.lastInsertRowid);
}
function messages(db,showId,after=0) {
  return db.prepare(
    "SELECT id,author,text,status,created_at FROM odd_tv_chat WHERE show_id=? AND id>? AND status!='hidden' ORDER BY id DESC LIMIT 50"
  ).all(showId,Math.max(0,Number(after)||0)).reverse();
}
function nextQuestions(db,showId,limit=3,productId=null) {
  const count=Math.max(1,Math.min(50,Math.floor(Number(limit)||3)));
  if(productId!==null)return db.prepare(
    "SELECT id,text,product_id FROM odd_tv_chat WHERE show_id=? AND status='queued' AND (product_id=? OR product_id IS NULL) ORDER BY id ASC LIMIT ?"
  ).all(showId,Number(productId),count);
  return db.prepare("SELECT id,text,product_id FROM odd_tv_chat WHERE show_id=? AND status='queued' ORDER BY id ASC LIMIT ?")
    .all(showId,count);
}
function nextQuestion(db,showId) {
  return nextQuestions(db,showId,1)[0]||null;
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
function markSent(db,showId,questionIds,now=Date.now()) {
  const ids=Array.isArray(questionIds)?questionIds:[questionIds];
  if(!ids.length||ids.some(id=>!Number.isSafeInteger(Number(id))||Number(id)<=0)||new Set(ids.map(Number)).size!==ids.length)return false;
  try {
    return db.transaction(()=>{
      const update=db.prepare("UPDATE odd_tv_chat SET status='sent',sent_at=? WHERE id=? AND show_id=? AND status='queued'");
      for(const id of ids) {
        if(update.run(new Date(now).toISOString(),Number(id),showId).changes!==1)throw new Error("QUESTION_STATE_CHANGED");
      }
      return true;
    })();
  } catch { return false; }
}
module.exports={SHOW_MINUTES,SCRIPT_MAX_CHARS,scriptTargetMinutes,init,validateProducts,pickProducts,createShow,startShow,prepareScriptedShow,currentShow,workerShow,currentProduct,productById,publicShow,activeViewerCount,postQuestion,messages,nextQuestion,nextQuestions,productPresentationDue,markProductPresented,setBroadcastDesired,getBroadcastControl,updateBroadcastHeartbeat,markSent};
