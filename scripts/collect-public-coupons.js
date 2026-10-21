const fs=require('node:fs');
const {collectPublicCoupons}=require('../src/publicCouponDiscovery');
(async()=>{
  const result=await collectPublicCoupons(fetch,[],Date.now(),{snapshot:false});
  for(const failure of result.sourceErrors) console.warn(JSON.stringify(failure));
  if(!result.offers.length) throw new Error('No current coupons verified; keeping the previous snapshot');
  fs.writeFileSync(process.env.COUPON_OUTPUT || 'public-coupons.json',JSON.stringify({offers:result.offers},null,2)+'\n');
  console.log(`Verified ${result.offers.length} current coupons; ${result.failedSources}/${result.sources} sources unavailable`);
})().catch(error=>{console.error(error.message);process.exitCode=1;});
