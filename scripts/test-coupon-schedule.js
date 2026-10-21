const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createCouponRefreshService}=require('../src/couponSchedule');
(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'odd-coupon-schedule-'));
  let clock=Date.parse('2026-10-21T12:00:00Z'), merchantCalls=0, publicCalls=0, rejectMerchant=false;
  const merchant={isConfigured:()=>true,refreshCoupons:async()=>{
    merchantCalls++;
    if(rejectMerchant) {const e=new Error('upstream private detail');e.status=401;throw e;}
    return {status:'success',received:3,active:2};
  }};
  const publicSource={refreshCoupons:async()=>{publicCalls++;return {status:'success',sources:2,failedSources:0,active:1};}};
  const options={directory,merchant,publicSource,now:()=>clock};
  let service=createCouponRefreshService(options);
  const first=service.run();assert.strictEqual(service.run(),first,'concurrent sweeps must share one refresh');
  await first;
  assert.equal(merchantCalls,1);assert.equal(publicCalls,1);
  assert.equal(service.status().sources.awin.status,'success');
  assert.equal(service.status().sources.awin.lastSuccessAt,new Date(clock).toISOString());
  await service.run();assert.equal(merchantCalls,1,'reads/early sweeps must not refresh');
  service=createCouponRefreshService(options);
  await service.run();assert.equal(merchantCalls,1,'restart preserves next-attempt deadlines');
  clock+=6*3600000;rejectMerchant=true;
  await service.run();assert.equal(publicCalls,2,'Awin failure must not block public offers');
  assert.equal(service.status().sources.awin.errorCode,'authentication_failed');
  assert(!JSON.stringify(service.status()).includes('private detail'));
  const lastSuccess=service.status().sources.awin.lastSuccessAt;
  clock+=3599000;await service.run();assert.equal(merchantCalls,2);
  clock+=1000;rejectMerchant=false;await service.run();assert.equal(merchantCalls,3,'failures retry in an hour');
  assert.notEqual(service.status().sources.awin.lastSuccessAt,lastSuccess);
  assert.equal(publicCalls,2,'failure retries do not spend the healthy source cadence');
  const missing=createCouponRefreshService({...options,directory:path.join(directory,'missing'),merchant:{isConfigured:()=>false,refreshCoupons:async()=>({status:'not_configured',errorCode:'missing_credentials'})}});
  assert.equal(missing.status().sources.awin.status,'not_configured');
  await missing.run();assert.equal(missing.status().sources.awin.lastSuccessAt,null);
  const partial=createCouponRefreshService({...options,directory:path.join(directory,'partial'),publicSource:{refreshCoupons:async()=>({status:'partial',sources:2,failedSources:1,active:1})}});
  await partial.run();assert.equal(partial.status().sources.public.status,'partial');
  assert.equal(Date.parse(partial.status().sources.public.nextAttemptAt)-clock,3600000);
  // Public reads no longer launch external requests. Only the scheduler does.
  for(const name of ['merchantCoupons','publicCoupons']) {
    const source=fs.readFileSync(path.join(__dirname,'../src',name+'.js'),'utf8');
    assert(!source.includes('refreshIfDue'),'lazy visitor-triggered refresh must be removed');
  }
  const server=fs.readFileSync(path.join(__dirname,'../src/server.js'),'utf8');
  assert(server.includes('cron.schedule("*/15 * * * *"'));
  assert(server.includes('Startup refresh failed'));
  fs.rmSync(directory,{recursive:true,force:true});
  console.log('Coupon scheduler: no visitors required, single flight, persisted cadence, isolated failures, safe diagnostics and retry passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
