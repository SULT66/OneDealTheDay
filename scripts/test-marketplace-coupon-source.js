const assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createMarketplaceCouponSource}=require("../src/marketplaceCouponSource");
const {createCouponRefreshService}=require("../src/couponSchedule");
(async()=>{
  const one=createMarketplaceCouponSource(()=>[{code:"SAVE10"}]);
  assert.deepEqual(await one.refreshCoupons(),{status:"success",active:1,received:1});
  const none=createMarketplaceCouponSource(()=>[]);
  assert.deepEqual(await none.refreshCoupons(),{status:"empty",active:0,received:0},
    "An empty product feed cannot claim fresh coupon verification");
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"odd-marketplace-coupons-"));
  const empty={isConfigured:()=>false,refreshCoupons:async()=>({status:"not_configured"})};
  const down={refreshCoupons:async()=>({status:"partial",sources:3,failedSources:3,active:0})};
  const service=createCouponRefreshService({directory:dir,merchant:empty,publicSource:down,marketplace:one});
  await service.run({force:true});
  const statuses=service.status().sources;
  assert.equal(statuses.marketplace.status,"success");
  assert.equal(statuses.marketplace.active,1);
  assert.equal(statuses.awin.status,"not_configured");
  assert.equal(statuses.public.status,"partial");
  fs.rmSync(dir,{recursive:true,force:true});
  console.log("Marketplace coupon source: verified inventory, honest empty status and isolated upstream failures passed.");
})().catch(e=>{console.error(e);process.exitCode=1;});
