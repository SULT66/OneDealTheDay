const fs = require('node:fs');
const path = require('node:path');
const INTERVAL = 6 * 3600000;
const RETRY = 3600000;

function createCouponRefreshService({directory, merchant, publicSource, now=Date.now}) {
  const statePath=path.join(directory,'coupon-refresh-state.json');
  let state={};
  try { const saved=JSON.parse(fs.readFileSync(statePath,'utf8')); if(saved && typeof saved==='object' && !Array.isArray(saved)) state=saved; } catch {}
  let pending=null;
  const sources={awin:merchant, public:publicSource};
  const persist=()=>{
    fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(`${statePath}.tmp`,JSON.stringify(state),{mode:0o600});
    fs.renameSync(`${statePath}.tmp`,statePath);
  };
  function status() {
    return {intervalHours:6, retryHours:1, running:Boolean(pending), sources:Object.fromEntries(Object.entries(sources).map(([key,source])=>{
      const previous=state[key] || {status:'pending'};
      const configured=source.isConfigured ? source.isConfigured() : true;
      return [key,{...previous,configured,...(!configured ? {status:'not_configured',errorCode:'missing_credentials'} : {})}];
    }))};
  }
  function run({force=false}={}) {
    if (pending) return pending;
    pending=(async()=>{
      let changed=false;
      for (const [key,source] of Object.entries(sources)) {
        const time=now(), previous=state[key] || {};
        if (!force && Date.parse(previous.nextAttemptAt)>time) continue;
        state[key]={...previous,lastAttemptAt:new Date(time).toISOString()};
        try {
          const result=await source.refreshCoupons();
          const success=result.status==='success';
          state[key]={...state[key],status:result.status,errorCode:result.errorCode || (result.status==='partial' ? 'source_unavailable' : null),
            lastSuccessAt:success ? new Date(now()).toISOString() : previous.lastSuccessAt || null,
            active:result.active ?? previous.active ?? 0,
            ...(result.received != null ? {received:result.received} : {}),
            ...(result.sources != null ? {checkedSources:result.sources,failedSources:result.failedSources,sourceResults:result.sourceResults || []} : {}),
            nextAttemptAt:new Date(now()+(success ? INTERVAL : RETRY)).toISOString()};
          changed ||= result.status==='success' || result.status==='partial';
        } catch (error) {
          // Never expose raw upstream errors, request URLs or credentials.
          state[key]={...state[key],status:'error',errorCode:[401,403].includes(error?.status) ? 'authentication_failed' : error?.code==='EACCES' || error?.code==='ENOSPC' ? 'storage_unavailable' : 'source_unavailable',
            nextAttemptAt:new Date(now()+RETRY).toISOString()};
        }
        try {persist();} catch {console.warn('[coupons] Refresh status could not be saved');}
        console.log(`[coupons] ${key}: ${state[key].status}${state[key].errorCode ? ` (${state[key].errorCode})` : ''}; active=${state[key].active ?? 0}`);
      }
      return {changed,...status()};
    })().finally(()=>{pending=null;});
    return pending;
  }
  return {run,status};
}
let service;
function couponRefreshService() {
  if (!service) service=createCouponRefreshService({
    directory:process.env.DATA_DIR || (process.env.WEBSITE_SITE_NAME ? '/home/data/onedealtheday' : path.join(__dirname,'..','data')),
    merchant:require('./merchantCoupons'),publicSource:require('./publicCoupons'),
  });
  return service;
}
module.exports={createCouponRefreshService,couponRefreshService};
