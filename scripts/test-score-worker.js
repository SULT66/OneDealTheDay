const assert = require('node:assert/strict');
const {scoreOffers} = require('../src/ranker');
const {scoreOffersAsync} = require('../src/scoreOffersAsync');

(async()=>{
  const items=Array.from({length:2000},(_,i)=>({external_id:`worker-${i}`,market:'us',source:'ebay',
    title:`Halloween hanging spider outdoor decoration ${i}`,current_price:10+i/100,currency:'USD',
    availability:'In stock',shipping_summary:'Free shipping',shipping_cost:0,return_summary:'30 day returns',
    image_url:'https://i.ebayimg.com/test.jpg',affiliate_url:`https://www.ebay.com/itm/${100000000000+i}`,
    seller_rating:99.8,seller_feedback_count:400,rating:4.7,review_count:50}));
  const expected=scoreOffers(items);
  let timerRan=false;
  const timer=setTimeout(()=>{timerRan=true;},0);
  const actual=await scoreOffersAsync(items,{}, {background:true});
  clearTimeout(timer);
  assert(timerRan,'The main thread must keep serving timers while the catalogue is scored');
  assert.deepEqual(actual,expected,'Worker scoring must preserve eligibility, cross-offer comparisons, score and order');
  assert.deepEqual(await scoreOffersAsync(items.slice(0,1)),scoreOffers(items.slice(0,1)));
  console.log('Catalogue worker: main-thread responsiveness and identical ranking passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
