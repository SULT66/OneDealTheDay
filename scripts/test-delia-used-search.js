const assert = require('assert');
const Database = require('better-sqlite3');
const {requestedCondition, matchesCondition} = require('../src/shoppingCondition');
const {createEbayClient, candidateIsUsable, searchProducts} = require('../src/providers/ebay');
const {createShoppingAssistant, mergeShoppingMission, shoppingMissionText, resolveShoppingRequest,
  matchesExplicitConstraints, deduplicateRecommendations} = require('../src/shoppingAssistant');
const market = {code:'us',currency:'USD',locale:'en-US',countryCodes:['US'],ebayMarketplaceId:'EBAY_US'};
const latest = 'а можно посмотреть подержанную?';
const original = {product_type:'graphics card',query_terms:['nvidia','rtx','3090','24gb'],condition:'new'};
const mission = mergeShoppingMission(original, {}, latest);
assert.equal(mission.condition, 'non_new');
assert(shoppingMissionText(mission).includes('3090'));
assert(shoppingMissionText(mission).endsWith('used or refurbished'));
assert(resolveShoppingRequest(latest, [{role:'user',content:'NVIDIA RTX 3090 24GB'}]).includes('3090'));
assert.equal(mergeShoppingMission(mission, {}, 'только новую').condition,'new');
assert.equal(mergeShoppingMission(mission, {}, 'а другие магазины?').condition,'non_new');
for (const text of ['б/у','подержанную','поддержанную','used','refurbished','open box']) assert.equal(requestedCondition(text),'non_new',text);
assert.equal(requestedCondition('new RTX 3090 used or refurbished. Only new'), 'new');
assert.equal(requestedCondition('new iPhone. Do not show refurbished or used products.'),'new');
assert(!matchesCondition({title:'RTX 3090',condition:'New'},'non_new'));
assert(matchesCondition({title:'RTX 3090',condition:'Used'},'non_new'));
assert(!matchesExplicitConstraints({title:'RTX 3090 New'}, 'RTX 3090 used or refurbished'));
assert(!matchesCondition({title:'RTX 3090 for parts Used'},'non_new'));
const base = {itemId:'v1|123456789012|0', title:'NVIDIA GeForce RTX 3090 24GB', condition:'Used',conditionId:'3000',buyingOptions:['FIXED_PRICE'],image:{imageUrl:'https://i.ebayimg.com/rtx.jpg'},itemAffiliateWebUrl:'https://www.ebay.com/itm/123456789012?campid=5339179772',price:{value:'599',currency:'USD'},seller:{feedbackPercentage:'99.9',feedbackScore:1000}};
assert(!candidateIsUsable(base));
assert(candidateIsUsable(base,'non_new'));
assert(!candidateIsUsable({...base,condition:'For parts or not working',conditionId:'7000'},'non_new'));
const db = new Database(':memory:');
db.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY,title TEXT,brand TEXT,category TEXT,market TEXT,status TEXT,source TEXT,
retailer_name TEXT,current_price REAL,original_price REAL,currency TEXT,rating REAL,review_count INTEGER,
seller_name TEXT,seller_rating REAL,seller_feedback_count INTEGER,shipping_summary TEXT,return_summary TEXT,
availability TEXT,checked_at TEXT,updated_at TEXT,image_url TEXT,affiliate_url TEXT,score REAL,
shipping_cost REAL,evidence_confidence REAL,score_breakdown TEXT);`);
(async () => {
  let requestedFilter;
  const ebayClient = createEbayClient({clientId:'test',clientSecret:'test',campaignId:'5339179772',fetchImpl:async (url) => {
    if (String(url).includes('/oauth2/token')) return {ok:true,json:async()=>({access_token:'test',expires_in:7200})};
    requestedFilter = new URL(url).searchParams.get('filter');
    return {ok:true,json:async()=>({itemSummaries:[base]})};
  }});
  await ebayClient.search('RTX 3090',market,'non_new');
  assert(requestedFilter.includes('conditionIds:{1500|2000|2010|2020|2030|2500|3000|4000|5000|6000}'));
  const products = await searchProducts({clientId:'test',clientSecret:'test',campaignId:'5339179772',market,keywords:['RTX 3090'],condition:'non_new',client:{search:async(_q,_m,c)=>{assert.equal(c,'non_new');return [base];},getItem:async()=>base}});
  assert.equal(products.length,1);
  assert.equal(products[0].condition,'Used');
  let providerRequest;
  const assistant = createShoppingAssistant({db,sourceSql:()=> '1=1',market:()=>market,
    retailerSearch:async(args)=>{providerRequest=args;return products;},
    client:{responses:{create:async(req)=>{
      if (!req.tools) return {output_text:JSON.stringify({scope:'shopping',turn_intent:'about_shown',mission_patch:{},starts_new_mission:false})};
      const error = new Error('Simulated search timeout');error.assistantTimeout=true;throw error;
    }}}});
  const result = await assistant.respond({message:latest,messages:[{role:'user',content:'NVIDIA RTX 3090 24GB'}],shoppingMission:original,
    shortlist:[{title:'NVIDIA RTX 3090 24GB',retailer:'Newegg',price_value:1935}],marketCode:'us',language:'ru'});
  assert(providerRequest.request.includes('3090'));
  assert(providerRequest.request.endsWith('used or refurbished'));
  assert.equal(result.recommendations.length,1,'A failed model search discarded verified used eBay inventory');
  assert.equal(result.recommendations[0].price_value,599);
  assert(result.recommendations[0].title.includes('Used'));
  assert.equal(result.shopping_mission.condition,'non_new');
  assert(!result.timed_out);
  const sixShops=deduplicateRecommendations(Array.from({length:6},(_,i)=>({title:'NVIDIA RTX 3090 24GB',retailer:`Store ${i}`,url:`https://shop${i}.example/product/rtx3090`,price_value:600+i})));
  assert.equal(sixShops.length,1);
  assert.equal(sixShops[0].other_offers.length,5,'Same-model stores were silently capped at two');
  const offer = (retailer,url,price) => ({title:'Used NVIDIA GeForce RTX 3090 24GB',retailer,url,price:`$${price}`,reason:'Used RTX 3090 24GB',source_type:'web'});
  const firstOffers = [offer('Newegg','https://www.newegg.com/p/N82E16814137595',610),offer('Walmart','https://www.walmart.com/ip/RTX-3090/123456789',620)];
  const extraOffer = offer('eBay','https://www.ebay.com/itm/987654321012',590);
  const reply = (offers) => ({output_text:JSON.stringify({answer:'Used RTX 3090 offers.',recommendations:offers}),
    output:[{type:'web_search_call',action:{sources:offers.map(({url,title})=>({url,title}))}}]});
  for (const failExpansion of [false,true]) {
    let searches=0;
    const expanded = createShoppingAssistant({db,sourceSql:()=> '1=1',market:()=>market,
      client:{responses:{create:async(req)=>{
        if (!req.tools) return {output_text:JSON.stringify({scope:'shopping',mission_patch:{},starts_new_mission:false})};
        searches++;
        if(searches===1)return reply(firstOffers);
        assert.equal(searches,2,'Store expansion must never recurse');
        const input=JSON.parse(req.input);
        assert.equal(input.already_found_offers.length,2);
        assert(input.resolved_shopping_request.includes('3090'));
        if(failExpansion)throw new Error('Simulated unavailable extra search');
        return reply([extraOffer]);
      }}}});
    const expandedResult=await expanded.respond({message:'Find used NVIDIA RTX 3090 24GB',shoppingMission:mission,marketCode:'us',language:'en'});
    assert.equal(searches,2);
    const stores=new Set(expandedResult.recommendations.flatMap(item=>[item.retailer,...(item.other_offers||[]).map(o=>o.retailer)]));
    assert.equal(stores.size,failExpansion ? 2 : 3,'Expansion lost original offers or failed to add the third store');
  }
  db.close();console.log('Delia used follow-up, condition-aware eBay and timeout fallback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
