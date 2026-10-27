const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
process.env.PORT='18159';process.env.ADMIN_KEY='test-coupon-admin';
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'odd-coupon-admin-'));
process.env.LIVE_REFRESH_ENABLED='false';process.env.SUPPORTED_MARKETS='us';
process.env.AWIN_API_TOKEN='';
const realFetch=global.fetch;
let calls=0;
global.fetch=async(url,options)=>{
 if(String(url).startsWith('http://127.0.0.1:18159'))return realFetch(url,options);
 if(/ebay\.com|jcpenney\.com|iherb\.com|public-coupons\.json/.test(String(url)))calls++;
 return {ok:false,status:403,text:async()=>''};
};
require('../app.js');
(async()=>{
 const base='http://127.0.0.1:18159',headers={'X-Admin-Key':process.env.ADMIN_KEY};
 for(let i=0;i<60;i++){try{const r=await realFetch(base+'/api/status');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 assert.equal((await realFetch(base+'/api/admin/coupons')).status,401);
 assert.equal((await realFetch(base+'/api/admin/coupons/refresh',{method:'POST'})).status,401);
 const first=await(await realFetch(base+'/api/admin/coupons',{headers})).json();
 assert.equal(typeof first.active,'number');
 assert.equal(first.sources.awin.configured,false);
 assert.equal(calls,0,'status reads must not start source requests');
 const response=await realFetch(base+'/api/admin/coupons/refresh',{method:'POST',headers});
 assert.equal(response.status,200);
 const refreshed=await response.json();
 assert.equal(refreshed.sources.public.status,'partial');
 assert.equal(refreshed.sources.public.failedSources,3);
 assert.equal(refreshed.sources.public.sourceResults.length,3);
 assert(refreshed.sources.public.sourceResults.every(s=>s.httpStatus===403));
 const attempted=calls;
 await realFetch(base+'/api/admin/coupons/refresh',{method:'POST',headers});
 assert(calls>attempted,'manual retry must bypass the persisted retry deadline');
 console.log('Coupon admin: authentication, source diagnostics, no fetch on reads and manual retry passed');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
