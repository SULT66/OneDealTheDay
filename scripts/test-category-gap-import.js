const assert = require('assert');
const { planGapSearches, SHELVES } = require('../src/categoryGaps');
const { searchProducts } = require('../src/providers/ebay');
const { presentProduct } = require('../src/productPresentation');
const counts = Object.keys(SHELVES).map(category => ({category, count:50}));
counts.find(row => row.category === 'Travel').count = 49;
const gapPlan = planGapSearches(counts, {now:0});
assert.deepStrictEqual(gapPlan.map(row => row.category), ['Travel']);
assert.strictEqual(gapPlan[0].missing, 1);
assert.deepStrictEqual(planGapSearches(counts.map(row => ({...row,count:50}))), []);

const market = {code:'us', currency:'USD', ebayMarketplaceId:'EBAY_US'};
function item(id, title='Travel Packing Cubes Set', rating=4.9) {
  return {itemId:`v1|${id}|0`,title,price:{value:'30',currency:'USD'},
    image:{imageUrl:'https://example.com/product.jpg'},itemAffiliateWebUrl:`https://www.ebay.com/itm/${id}`,
    seller:{username:'trusted',feedbackPercentage:'99.9',feedbackScore:20000},
    primaryProductReviewRating:{averageRating:rating,reviewCount:2000},
    shippingOptions:[{shippingCost:{value:'0',currency:'USD'}}],
    returnTerms:{returnsAccepted:true,returnPeriod:{value:30,unit:'DAY'},returnShippingCostPayer:'SELLER'},
    estimatedAvailabilities:[{estimatedAvailabilityStatus:'IN_STOCK'}],condition:'New',conditionId:'1000',
    buyingOptions:['FIXED_PRICE'],brand:'Samsonite',epid:String(id),topRatedBuyingExperience:true};
}
(async()=>{
  const pool = Array.from({length:60}, (_,i)=>item(100000000000+i, undefined, i<10?4.4:4.9));
  const unscored = {...item(100000000999),primaryProductReviewRating:{}};
  const known = item(100000000998);
  let details=0;
  const result = await searchProducts({clientId:'test',clientSecret:'test',campaignId:'5339179772',
    market,keywords:['packing cubes'],gapPlan,existingProviderIds:[`ebay:${known.itemId}`],
    detailLimit:100,targetEligible:1,client:{search:async()=>[unscored,known,...pool,{...pool[59],itemId:"v1|777777777777|0"}],
      getItem:async id=>{details++;return [unscored,known,...pool,{...pool[59],itemId:"v1|777777777777|0"}].find(row=>row.itemId===id);}}});
  const added = result.filter(row=>row.external_id!==known.itemId);
  assert.strictEqual(require('../src/ranker').selectUniqueProducts(added).length,50,'The selected batch must survive catalogue deduplication');
  assert.strictEqual(added.length,50,'49 existing listings must still trigger a whole 50-listing batch');
  assert(added.every(row=>presentProduct(row).display_score!=null),'every new gap listing must actually show Score');
  assert(!added.some(row=>row.external_id===unscored.itemId),'seller-only evidence cannot fill the scored batch');
  assert(added.every(row=>row.rating===4.9),'select the highest public Scores after inspecting the bounded pool');
  assert(result.some(row=>row.external_id===known.itemId),'refreshing an existing offer must not count as a new addition');
  assert(details<=100,'category discovery cannot exceed the shared detail budget');

  const looked=[];
  const second = [{category:'Travel'},{category:'Automotive'}];
  const cars = Array.from({length:20},(_,i)=>item(200000000000+i,'Car Tire Inflator'));
  await searchProducts({clientId:'test',clientSecret:'test',campaignId:'5339179772',market,
    keywords:['packing cubes','tire inflator'],gapPlan:second,detailLimit:10,targetEligible:1,
    client:{search:async q=>q==='packing cubes'?pool:cars,getItem:async id=>{
      looked.push(id);return [...pool,...cars].find(row=>row.itemId===id);}}});
  assert(looked.some(id=>id.startsWith('v1|100')) && looked.some(id=>id.startsWith('v1|200')),
    'one category must not consume the entire shared budget');
  assert.strictEqual(looked.length,10);

  const ali=require('../src/providers/aliexpress');
  const aliItem = i=>({product_id:String(i),product_title:'Travel Packing Cubes Set',target_sale_price:'15',
    target_sale_price_currency:'USD',target_original_price:'20',evaluate_rate:'98',lastest_volume:500,
    ship_to_days:7,product_main_image_url:'https://example.com/product.jpg',
    promotion_link:`https://s.click.aliexpress.com/e/${i}`});
  const aliResult=await ali.searchProducts({appKey:'test',appSecret:'test',trackingId:'test',market,
    keywords:['packing cubes'],rotate:false,keywordCategories:{'packing cubes':'Travel'},
    maxProducts:340,maxProductsPerKeyword:20,existingProviderIds:['aliexpress:1'],
    fetchImpl:async()=>({ok:true,json:async()=>({aliexpress_affiliate_product_query_response:{
      resp_result:{resp_code:200,result:{products:{product:Array.from({length:30},(_,i)=>aliItem(i+1))}}}}})})});
  assert.strictEqual(aliResult.length,21);
  assert(aliResult.some(row=>row.external_id==='1'),'Existing AliExpress prices must still be refreshed');
  assert.strictEqual(aliResult.filter(row=>row.external_id!=='1').length,20,'Existing listings do not count towards 20 new offers');
  assert(aliResult.every(row=>row.rating===0 && row.review_count===0),'AliExpress must never invent product reviews');
  console.log('Category gap import: strict <50, 50 scored new eBay offers, ranked selection, fair bounded budget, 20 new AliExpress offers passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
