// Run the real publish endpoint without provider requests or live emails.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {priceAgrees, priceIsVerified} = require('../src/liveStock');
const source = fs.readFileSync('src/server.js', 'utf8');
const start = source.indexOf('app.post("/api/admin/live-drops/:key/publish"');
assert(start >= 0);
const route = source.slice(start, source.indexOf('\n});', start) + 4);

async function publish({dropPrice=152, listingPrice=160, reference=0, published=true,
  missing=false, deleted=false, state='upcoming', unavailable=false}={}) {
  const row = {id:1, drop_key:'test', currency:'USD', market:'us', drop_price:dropPrice,
    retail_price:reference, listing_price:listingPrice, published:0, deleted_at:deleted?'date':null};
  let handler, status=200, result;
  const db = {prepare:sql=>({get:()=>missing?undefined:row,run:(...args)=>{
    if(sql.includes('UPDATE live_drops SET published=')) row.published=args[0];
    if(sql.includes('first_published_at=?'))row.first_published_at=args[0];
  }})};
  vm.runInNewContext(route, {
    app:{post:(_path, _admin, fn)=>{handler=fn;}}, admin:()=>{},db,priceAgrees,
    dropState:()=>state,market:()=>({code:'us'}),Date,
    refreshDropStock:async()=>{if(unavailable)throw new Error('provider unavailable');return {reason:'checked'};},
    console:{log:()=>{},error:()=>{}},
  });
  const res={status:code=>{status=code;return res;},json:body=>{result=body;return res;}};
  await handler({params:{key:'test'},body:{published}},res);
  return {status,result,row};
}
(async()=>{
  const mismatch=await publish();
  assert.equal(mismatch.status,200);assert.equal(mismatch.row.published,1);
  assert.equal(mismatch.result.published,true);assert(mismatch.row.first_published_at);
  assert.match(mismatch.result.warnings[0],/152\.00/);assert.match(mismatch.result.warnings[0],/160\.00/);
  assert.equal(mismatch.row.drop_price,152,'publishing silently rewrote the entered price');
  assert.equal(priceIsVerified({...mismatch.row,price_verified_at:new Date().toISOString()}),false);
  const reference=await publish({dropPrice:160,reference:150});
  assert.equal(reference.status,200);assert.equal(reference.row.published,1);
  assert.match(reference.result.warnings[0],/comparison-price warning/);
  const matching=await publish({dropPrice:160});
  assert.equal(matching.status,200);assert.equal(matching.result.warnings.length,0);
  assert.equal((await publish({unavailable:true})).status,200,'provider outage blocked publication');
  assert.equal((await publish({missing:true})).status,404);
  assert.equal((await publish({deleted:true})).status,404);
  assert.equal((await publish({published:false,state:'live'})).status,409,'active-show unpublish protection was removed');
  const unpublish=await publish({published:false});
  assert.equal(unpublish.status,200);assert.equal(unpublish.row.published,0);
  console.log('Publish: price/reference mismatches warn without blocking; verification and account guards remain intact.');
})().catch(error=>{console.error(error);process.exitCode=1;});
