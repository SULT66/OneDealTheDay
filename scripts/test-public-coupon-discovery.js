const assert=require('node:assert/strict');
const {discoverEbay,discoverJcp,collectPublicCoupons}=require('../src/publicCouponDiscovery');
const now=Date.parse('2026-10-21T18:00:00Z');
const table='<table><tr><td>10% off tires</td><td>TIRES10</td><td>10/28/2026</td><td><a href="https://www.ebay.com/e/tires">Shop</a></td></tr></table>';
assert.equal(discoverEbay(`<script>${JSON.stringify(table.replaceAll('</','</'))}</script>`,now)[0].code,'TIRES10');
const coupon={offers:[{headLine:'20% off',bodyCopy:'select items'}],promoCode:'FRESH20',disclaimer:'Exclusions apply.',redeemingChannel:'online',offerStartDate:'2026-10-20T00:00:00-05:00',offerEndDate:'2026-10-25T23:59:59-05:00'};
assert.equal(discoverJcp(JSON.stringify(coupon),now)[0].expiresAt,'2026-10-26T04:59:59.000Z');
assert.equal(discoverJcp(JSON.stringify({...coupon,offerStartDate:'2026-11-01T00:00:00Z'}),now).length,0);
assert.equal(discoverJcp(JSON.stringify({...coupon,redeemingChannel:'store'}),now).length,0);
assert.equal(discoverJcp(JSON.stringify({...coupon,offerEndDate:'2026-10-20T00:00:00Z'}),now).length,0);
(async()=>{
  const fetchImpl=async url=>{
    if(url.includes('raw.githubusercontent.com')) return {ok:true,text:async()=>JSON.stringify({offers:[
      {...discoverEbay(table,now)[0],checkedAt:'2026-10-18T00:00:00Z'},
      {...discoverEbay(table,now)[0],code:'OTHER10',id:'other10',checkedAt:'2026-10-21T17:00:00Z'},
    ]})};
    if(url.includes('ebay.com')) return {ok:true,status:200,text:async()=>table};
    throw new Error('Merchant temporarily unavailable');
  };
  const result=await collectPublicCoupons(fetchImpl,[],now);
  assert.equal(result.snapshotUsed,true);
  assert.deepEqual(result.offers.map(r=>r.code),['TIRES10','OTHER10']);
  assert.equal(result.offers[1].checkedAt,'2026-10-21T17:00:00Z');
  const invalid=table.replace('https://www.ebay.com/e/tires','https://untrusted.example/');
  const safe=await collectPublicCoupons(async()=>({ok:true,status:200,text:async()=>invalid}),[],now,{snapshot:false});
  assert.equal(safe.offers.length,0);
  console.log('Public coupon discovery, expiry, safe destinations and snapshot freshness passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
