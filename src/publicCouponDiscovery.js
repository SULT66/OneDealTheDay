const seed=require('../site-content/public-coupons.json');
const EBAY='https://www.ebay.com/b/eBay-Coupons/bn_7109765183';
const JCP='https://www.jcpenney.com/m/jcpenney-coupons';
const SNAPSHOT='https://raw.githubusercontent.com/SULT66/OneDealTheDay/coupon-data/public-coupons.json';
const text=value=>String(value || '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
function jsonObjectAt(source,start) {
  let depth=0,quoted=false,escaped=false;
  for(let i=start;i<source.length;i++) {
    const c=source[i];
    if(quoted) { if(escaped) escaped=false; else if(c==='\\') escaped=true; else if(c==='"') quoted=false; continue; }
    if(c==='"') quoted=true;
    else if(c==='{') depth++;
    else if(c==='}' && --depth===0) {try{return JSON.parse(source.slice(start,i+1));}catch{return null;}}
  }
  return null;
}
function discoverEbay(html,now=Date.now()) {
  // eBay embeds its coupon table as JSON-encoded HTML in the page model.
  const fragments=[html];
  for(const m of html.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    if(!m[0].includes('COUPON CODE')) continue;
    try {fragments.push(JSON.parse(m[0]));}catch{}
  }
  const found=[];
  for(const fragment of fragments) for(const row of fragment.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if(cells.length!==4) continue;
    const code=text(cells[1]), date=text(cells[2]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if(!/^[A-Z0-9_-]{2,100}$/.test(code) || !date) continue;
    const expiresOn=`${date[3]}-${date[1].padStart(2,'0')}-${date[2].padStart(2,'0')}`;
    const url=cells[3].match(/href=["']([^"']+)["']/i)?.[1];
    found.push({id:`ebay-${code.toLowerCase()}`,store:'ebay',code,title:text(cells[0]),
      terms:'Selected eligible items only. Spending limits, account eligibility and other exclusions may apply. Check the official promotion before buying.',
      url,sourceUrl:EBAY,markets:['us'],expiresOn,checkedAt:new Date(now).toISOString()});
  }
  return found;
}
function discoverJcp(html,now=Date.now()) {
  const found=[];
  for(const m of html.matchAll(/\{"offers"\s*:/g)) {
    const data=jsonObjectAt(html,m.index);
    if(!data || data.redeemingChannel!=='online' || !/^[A-Z0-9_-]{2,100}$/.test(data.promoCode || '') ||
      !Number.isFinite(Date.parse(data.offerStartDate)) || Date.parse(data.offerStartDate)>now ||
      !Number.isFinite(Date.parse(data.offerEndDate)) || Date.parse(data.offerEndDate)<=now) continue;
    const first=data.offers?.[0];
    if(!first?.headLine || !data.disclaimer) continue;
    found.push({id:`jcpenney-${data.promoCode.toLowerCase()}`,store:'jcpenney',code:data.promoCode,
      title:text(`${first.headLine} ${first.bodyCopy || ''}`),
      description:data.offers.slice(1).map(offer=>text(`${offer.headLine} ${offer.bodyCopy || ''}`)).join('; '),
      terms:text(data.disclaimer),url:JCP,sourceUrl:JCP,markets:['us'],
      expiresAt:new Date(data.offerEndDate).toISOString(),checkedAt:new Date(now).toISOString()});
  }
  return found;
}
async function collectPublicCoupons(fetchImpl=fetch,previous=[],now=Date.now(),{snapshot=true}={}) {
  const {fetchOfficialPage,reviewOffers,normalizePublicCoupon}=require('./publicCoupons');
  const sources=[...new Set([...seed.offers.map(row=>row.sourceUrl).filter(url=>!url.includes('/PrintPass/')),EBAY,JCP])];
  const results=await Promise.allSettled(sources.map(async url=>{
    const host=new URL(url).hostname.replace(/^www\./,'');
    const html=await fetchOfficialPage(url,host,fetchImpl);
    let reviewed=await reviewOffers(async()=>({ok:true,status:200,text:async()=>html}),seed.offers.filter(row=>row.sourceUrl===url),now);
    if(url===EBAY) reviewed.push(...discoverEbay(html,now));
    if(url===JCP) reviewed.push(...discoverJcp(html,now));
    return reviewed;
  }));
  let candidates=[...previous,...results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value)];
  let snapshotUsed=false;
  if(snapshot && results.some(r=>r.status==='rejected')) {
    try {
      const response=await fetchImpl(SNAPSHOT,{redirect:'error',signal:AbortSignal.timeout(15000)});
      if(!response.ok) throw new Error('Snapshot unavailable');
      const body=await response.text();
      if(body.length>1000000) throw new Error('Snapshot too large');
      const data=JSON.parse(body);
      if(Array.isArray(data.offers)) {candidates.push(...data.offers); snapshotUsed=true;}
    }catch{}
  }
  const unique=new Map();
  for(const raw of candidates) {
    if(!normalizePublicCoupon(raw,now)) continue;
    const key=`${raw.store}:${raw.code}`,old=unique.get(key);
    if(!old || Date.parse(raw.checkedAt)>Date.parse(old.checkedAt)) unique.set(key,raw);
  }
  const failedSources=results.filter(r=>r.status==='rejected').length;
  const sourceResults=results.map((result,index)=>({source:sources[index],
    status:result.status==='fulfilled' ? 'checked' : 'unavailable',
    offers:result.status==='fulfilled' ? result.value.filter(raw=>normalizePublicCoupon(raw,now)).length : 0,
    ...(result.status==='rejected' ? {httpStatus:result.reason?.status || null} : {})}));
  return {offers:[...unique.values()],sources:sources.length,failedSources,snapshotUsed,sourceResults};
}
module.exports={discoverEbay,discoverJcp,collectPublicCoupons};
