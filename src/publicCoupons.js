// Public merchant offers are independent of product feeds and affiliate membership.
// Every entry names its official source; undated offers have a short review window.
const seed = require("../site-content/public-coupons.json");
const fs = require("fs");
const path = require("path");
const {discountPercentage} = require("./merchantCoupons");
const DAY = 86400000;
const dataDir = process.env.DATA_DIR || (process.env.WEBSITE_SITE_NAME ? "/home/data/onedealtheday" : path.join(__dirname,"..","data"));
const snapshotPath = path.join(dataDir,"public-coupons-reviewed.json");
let offers = seed.offers;
try {
  const saved = JSON.parse(fs.readFileSync(snapshotPath,"utf8"));
  if (Array.isArray(saved)) offers = seed.offers.map(raw=>{
    const reviewed = saved.find(row=>row.id===raw.id && row.code===raw.code && row.sourceUrl===raw.sourceUrl);
    return reviewed && Date.parse(reviewed.checkedAt) > Date.parse(raw.checkedAt) ? {...raw,checkedAt:reviewed.checkedAt} : raw;
  });
} catch {}
let pending=null, lastAttempt=0;
function officialUrl(value, host) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === host || url.hostname === `www.${host}`) ? url.href : null;
  } catch { return null; }
}
function normalizePublicCoupon(raw, now=Date.now()) {
  const shop = seed.stores[raw.store];
  if (!shop || !/^[a-z0-9-]+$/.test(raw.id || "") || !/^[A-Z0-9_-]{2,100}$/.test(raw.code || "") ||
      !raw.title || !raw.terms || !raw.markets?.includes("us")) return null;
  const checked = Date.parse(raw.checkedAt);
  // Do not renew dates merely because a deployment or product refresh ran.
  if (!Number.isFinite(checked) || checked > now || now-checked > 2*DAY) return null;
  if (raw.expiresOn) {
    const end = Date.parse(`${raw.expiresOn}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.expiresOn) || !Number.isFinite(end) ||
        new Date(end).toISOString().slice(0,10) !== raw.expiresOn || now >= end+DAY) return null;
  }
  const href = officialUrl(raw.url, shop.host);
  const termsUrl = officialUrl(raw.sourceUrl, shop.host);
  if (!href || !termsUrl) return null;
  return {id:`public:${raw.id}`, merchant:shop.name, code:raw.code, title:raw.title,
    description:raw.description || "", terms:raw.terms, checkedAt:raw.checkedAt,
    expiresAt:"", expiresOn:raw.expiresOn || "", discountPercent:discountPercentage(raw.title),
    href, termsUrl, affiliate:false, sourceType:"official-public"};
}
function activePublicCoupons(rows,market="us", now=Date.now()) {
  if (market !== "us") return [];
  const seen = new Set();
  return rows.map(raw=>normalizePublicCoupon(raw,now)).filter(offer=>{
    if (!offer || seen.has(`${offer.merchant}:${offer.code}`)) return false;
    seen.add(`${offer.merchant}:${offer.code}`); return true;
  });
}
function listPublicCoupons(market="us") {
  if (market !== "us") return [];
  refreshIfDue();
  return activePublicCoupons(offers,market);
}
const sourceText = html=>String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ")
  .replace(/&nbsp;|&#160;/g," ").replace(/\s+/g," ").replace(/\s+%/g,"%").toLowerCase();
function confirmsOffer(html, raw) {
  const text = sourceText(html), code = raw.code.toLowerCase();
  if (!raw.evidence?.length) return false;
  for (let index=text.indexOf(code); index>=0; index=text.indexOf(code,index+code.length)) {
    if (/[a-z0-9_-]/.test(text[index-1] || "") || /[a-z0-9_-]/.test(text[index+code.length] || "")) continue;
    const context = text.slice(Math.max(0,index-400),index+400);
    if (raw.evidence.every(phrase=>context.includes(sourceText(phrase)))) return true;
  }
  return false;
}
async function reviewOffers(fetchImpl=fetch, rows=offers, now=Date.now()) {
  const sources = [...new Set(rows.map(raw=>raw.sourceUrl))];
  const pages = await Promise.allSettled(sources.map(async url=>{
    const raw = rows.find(row=>row.sourceUrl===url);
    if (!officialUrl(url,seed.stores[raw.store]?.host)) throw new Error("Untrusted coupon source");
    const response = await fetchImpl(url,{redirect:"error",signal:AbortSignal.timeout(15000),headers:{"Cache-Control":"no-cache"}});
    if (!response.ok) throw new Error("Coupon source unavailable");
    const html = await response.text();
    if (html.length>5000000) throw new Error("Coupon source too large");
    return html;
  }));
  return rows.map(raw=>{
    const page = pages[sources.indexOf(raw.sourceUrl)];
    return page.status === "fulfilled" && confirmsOffer(page.value,raw)
      ? {...raw,checkedAt:new Date(now).toISOString()} : raw;
  });
}
function refreshIfDue() {
  if (pending || Date.now()-lastAttempt<6*3600000) return;
  lastAttempt=Date.now();
  pending=reviewOffers().then(next=>{
    offers=next;
    try {
      fs.mkdirSync(dataDir,{recursive:true});
      fs.writeFileSync(`${snapshotPath}.tmp`,JSON.stringify(next),{mode:0o600});
      fs.renameSync(`${snapshotPath}.tmp`,snapshotPath);
    } catch { console.warn("[coupons] Could not persist public source reviews"); }
  }).catch(()=>console.warn("[coupons] Public source review unavailable; retaining recent offers"))
    .finally(()=>{pending=null;});
}
module.exports = {listPublicCoupons, activePublicCoupons, normalizePublicCoupon, confirmsOffer, reviewOffers};
