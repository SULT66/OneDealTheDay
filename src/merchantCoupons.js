const fs = require("fs");
const path = require("path");
const seed = require("../site-content/merchant-coupons.json");
const DAY = 86400000;
const MAX_AGE = 7 * DAY;
const REFRESH_INTERVAL = 6 * 3600000;
const SHOPS = {
  129485: {name:"Silver Brush", host:"silverbrush.com"},
  126513: {name:"Argendon", host:"argendon.com"},
  45915: {name:"FNTCASE", host:"fntcase.com"},
  66494: {name:"Mooncool", host:"mooncool.com"},
  95201: {name:"Giftlab", host:"giftlab.com"},
};
function utcTime(value) {
  const text = String(value || "");
  return Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : `${text}Z`);
}
function clean(value, limit=3000) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
function normalizeOffer(raw, checkedAt, now=Date.now()) {
  const shop = SHOPS[raw.advertiser?.id];
  const code = clean(raw.voucher?.code,100);
  const starts = utcTime(raw.startDate), ends = utcTime(raw.endDate);
  if (!shop || raw.advertiser?.joined !== true || raw.type !== "voucher" || !code ||
      !Number.isFinite(starts) || !Number.isFinite(ends) || starts > now || ends <= now ||
      !Number.isFinite(Date.parse(checkedAt)) || Date.parse(checkedAt) > now || now-Date.parse(checkedAt) > MAX_AGE) return null;
  if (!raw.regions?.all && !raw.regions?.list?.some(r => r.countryCode === "US")) return null;
  const title = clean(raw.title,300), description = clean(raw.description), terms = clean(raw.terms);
  if (!title || /commission/i.test(description) || /^\d+$/.test(terms)) return null;
  const percentages = new Set(`${title} ${description} ${terms}`.match(/\b\d+(?:\.\d+)?\s*%/g)?.map(p=>p.replace(/\s/g,"")) || []);
  if (percentages.size > 1) return null; // contradictory merchant discount claims
  let target, tracking;
  try {
    target = new URL(raw.url);
    tracking = new URL(raw.urlTracking);
    const targetHost = target.hostname.replace(/^www\./, "");
    const encodedTarget = new URL(tracking.searchParams.get("ued"));
    if (!["http:","https:"].includes(target.protocol) || targetHost !== shop.host || target.username || target.password ||
        tracking.protocol !== "https:" || tracking.hostname !== "www.awin1.com" || tracking.pathname !== "/cread.php" ||
        tracking.username || tracking.password || tracking.searchParams.get("awinaffid") !== "3018019" ||
        tracking.searchParams.get("awinmid") !== String(raw.advertiser.id) || encodedTarget.href !== target.href) return null;
  } catch { return null; }
  if (!/^\d+$/.test(String(raw.promotionId))) return null;
  return {id:String(raw.promotionId), merchant:shop.name, code, title, description, terms,
    expiresAt:new Date(ends).toISOString(), checkedAt, trackingUrl:tracking.href,
    href:`/go/coupon/${raw.promotionId}?market=us`};
}
function activeOffers(snapshot, now=Date.now()) {
  const seen = new Set();
  return (snapshot.offers || []).map(o => normalizeOffer(o,snapshot.checkedAt,now)).filter(o => {
    if (!o || seen.has(`${o.merchant}:${o.code}`)) return false;
    seen.add(`${o.merchant}:${o.code}`); return true;
  });
}
const dataDir = process.env.DATA_DIR || (process.env.WEBSITE_SITE_NAME ? "/home/data/onedealtheday" : path.join(__dirname,"..","data"));
const snapshotPath = path.join(dataDir,"merchant-coupons.json");
let snapshot = seed;
try {
  const saved = JSON.parse(fs.readFileSync(snapshotPath,"utf8"));
  if (Date.parse(saved.checkedAt) > Date.parse(seed.checkedAt) && Array.isArray(saved.offers)) snapshot = saved;
} catch {}
let pending = null, lastAttempt = 0;
async function fetchOffers(fetchImpl=fetch, token=process.env.AWIN_API_TOKEN, publisherId=process.env.AWIN_PUBLISHER_ID || "3018019") {
  if (!token || publisherId !== "3018019") throw new Error("Awin coupon credentials unavailable");
  const offers = [];
  for (let page=1; page<=20; page++) {
    const response = await fetchImpl(`https://api.awin.com/publisher/${publisherId}/promotions`, {
      method:"POST", redirect:"error", signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({filters:{membership:"joined",status:"active",type:"voucher",regionCodes:["US"],advertiserIds:Object.keys(SHOPS).map(Number)},pagination:{page,pageSize:200}}),
    });
    if (!response.ok) throw new Error(`Awin coupon request failed (${response.status})`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.data;
    if (!Array.isArray(rows)) throw new Error("Unexpected Awin coupon response");
    offers.push(...rows);
    if (rows.length < 200) return {checkedAt:new Date().toISOString(),offers};
  }
  throw new Error("Awin coupon pagination limit exceeded");
}
function refreshIfDue() {
  if (!process.env.AWIN_API_TOKEN || pending || Date.now()-lastAttempt < REFRESH_INTERVAL) return;
  lastAttempt = Date.now();
  pending = fetchOffers().then(next => {
    snapshot = next;
    try {
      fs.mkdirSync(dataDir,{recursive:true});
      fs.writeFileSync(`${snapshotPath}.tmp`,JSON.stringify(next),{mode:0o600});
      fs.renameSync(`${snapshotPath}.tmp`,snapshotPath);
    } catch { console.warn("[coupons] Could not persist coupon snapshot"); }
  }).catch(() => console.warn("[coupons] Awin refresh unavailable; retaining recent offers"))
    .finally(() => {pending=null;});
}
function listCoupons(market="us") {
  if (market !== "us") return [];
  refreshIfDue();
  return activeOffers(snapshot).map(({trackingUrl,...publicOffer})=>publicOffer);
}
function couponDestination(id,market="us") {
  if (market !== "us") return null;
  refreshIfDue();
  return activeOffers(snapshot).find(o=>o.id===String(id))?.trackingUrl || null;
}
module.exports = {normalizeOffer,activeOffers,fetchOffers,listCoupons,couponDestination};
