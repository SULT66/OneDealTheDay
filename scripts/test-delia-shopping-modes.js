const assert=require('node:assert/strict');
const {shoppingMode,taskQuestion,publicProductUrl,sameProductUrl,totalBudget,wantsBundle,assembleBundle,previewProductId}=require('../src/deliaShoppingModes');

const coffee=taskQuestion({message:'Нужна кофемашина до $200',language:'ru'});
assert.equal(coffee.clarifying_questions.length,1);
assert.notEqual(coffee.message,coffee.clarification_prompts[0].question,'The question must not be repeated as both the message and prompt');
assert.deepEqual(coffee.clarification_prompts[0].options,['Дома','В офисе','В поездках']);
assert.equal(coffee.shopping_mission.budget_max,200);
assert.equal(taskQuestion({message:'I need a portable coffee machine for travel',language:'en'}),null);
assert.equal(taskQuestion({message:'I need a Nespresso coffee machine',language:'en'}),null);
assert.equal(taskQuestion({message:'I need a coffee machine',language:'en',skipClarification:true}),null);
assert.equal(taskQuestion({message:'I need a coffee machine',language:'en',messages:[{role:'assistant',content:'At home or travel?'}]}),null);
for(const [text,n] of [['Build a desk setup for $200 total',200],['Собери комплект за 200 долларов',200],['under USD 1,200.50',1200.5],['200',200],['200,50',200.5],['$0',0]])assert.equal(totalBudget(text),n,text);
assert(wantsBundle('Обустрой рабочий стол за $200'));
assert(wantsBundle('Build a camping kit under $150'));
assert(!wantsBundle('Find a desk under $200'));
assert(!wantsBundle('Find a laptop under $500',{bundle_request:'Build a desk setup'}),'A new product request must leave the pending set');
for(const u of ['https://127.0.0.1/p/1','https://[::1]/p/1','https://localhost/p/1','https://shop.local/p/1','http://www.ebay.com/itm/123','https://user:secret@www.ebay.com/itm/123','https://www.ebay.com/itm/123?token=secret','https://www.ebay.com/cart','https://www.ebay.com:8080/itm/123'])assert.equal(publicProductUrl(u,()=>true).url,null,u);
assert.equal(publicProductUrl('https://www.ebay.com/itm/123',()=>false).url,null);
assert.equal(publicProductUrl('https://www.ebay.com/itm/123 https://www.ebay.com/itm/456',()=>true).url,null);
assert(sameProductUrl('https://www.ebay.com/itm/123?campid=1','https://ebay.com/itm/123'));
assert(!sameProductUrl('https://www.ebay.com/itm/123?var=1','https://www.ebay.com/itm/123?var=2'));
assert.equal(previewProductId({message:'Is it a good price?',product_id:8}),8);
assert.equal(previewProductId({message:'Build a desk setup for $200 total',product_id:8}),null);
assert.equal(previewProductId({message:'https://www.ebay.com/itm/123',product_id:8}),null);
const offer=(url,price,extra={})=>({title:url,url:'https://shop.example/'+url,price_value:price,currency:'USD',source_type:'catalog',shipping_cost:0,...extra});
const groups=[{label:'Desk',offers:[offer('desk',180),offer('desk-budget',120)]},{label:'Lamp',offers:[offer('lamp',30)]},{label:'Organizer',offers:[offer('organizer',20)]}];
const combined=assembleBundle(groups,200,'USD');
assert.equal(combined.complete,true);
assert.equal(combined.known_total,170);
assert.equal(combined.recommendations[0].title,'desk-budget');
assert.equal(combined.recommendations[0].bundle_component,'Desk');
assert.equal(combined.shipping_complete,true);
assert.equal(assembleBundle(groups,100,'USD').complete,false,'Do not return an over-budget set');
assert.equal(assembleBundle([{label:'A',offers:[offer('same',10)]},{label:'B',offers:[offer('same',10)]}],50,'USD').complete,false,'One listing cannot fill two roles');
assert.equal(assembleBundle([{label:'A',offers:[offer('a',10,{currency:'EUR'})]},{label:'B',offers:[offer('b',10)]}],50,'USD').complete,false,'Do not add different currencies');
assert.equal(assembleBundle([{label:'A',offers:[offer('a',99,{shipping_cost:2})]},{label:'B',offers:[offer('b',99)]}],199,'USD').complete,false,'Known shipping belongs in the budget');
const unknown=assembleBundle([{label:'A',offers:[offer('a',.1,{shipping_cost:null})]},{label:'B',offers:[offer('b',.2)]}],.3,'USD');
assert.equal(unknown.known_total,.3,'Use integer cents');
assert.equal(unknown.shipping_complete,false,'Missing shipping is unknown, not free');

const options={language:'en',market:{code:'us',currency:'USD'},model:'fixture',bounded:(fn)=>fn(new AbortController().signal),allowedLink:()=>true,extractSources:r=>r.sources||[],catalogLink:()=>null,search:async()=>{throw Error('Unexpected search');},openai:{responses:{create:async()=>{throw Error('Unexpected model request');}}}};
(async()=>{
 const {createShoppingAssistant}=require('../src/shoppingAssistant');
 const entry=createShoppingAssistant({db:{},sourceSql:()=>'',market:()=>options.market,client:options.openai});
 const taskEntry=await entry.respond({message:'Нужна кофемашина',marketCode:'us',language:'en'});
 assert.deepEqual(taskEntry.clarification_prompts[0].options,['Дома','В офисе','В поездках'],'Actual assistant entry point must detect task and shopper language without a model call');
 const ask=await shoppingMode({...options,message:'Build a desk setup'});
 assert.equal(ask.clarifying_questions.length,1);
 assert.equal(ask.shopping_mission.bundle_request,'Build a desk setup');
 const wrongCurrency=await shoppingMode({...options,message:'Build a desk setup for 200 EUR total'});
 assert(wrongCurrency.clarifying_questions[0].includes('USD'));
 let searches=0,modelCalls=0;
 const bundle=await shoppingMode({...options,message:'200',shoppingMission:ask.shopping_mission,
  openai:{responses:{create:async()=>{modelCalls++;return {output_text:JSON.stringify({title:'Desk setup',components:[{label:'Desk',query:'office desk',weight:7},{label:'Lamp',query:'desk lamp',weight:2},{label:'Organizer',query:'desk organizer',weight:1}]})};}}},
  search:async({message,skipClarification,responseBudgetMs})=>{searches++;assert(skipClarification);assert(responseBudgetMs<58000);return {recommendations:[message.includes('office desk')?offer('desk',120):message.includes('desk lamp')?offer('lamp',20):offer('organizer',10)]};}
 });
 assert.equal(modelCalls,1);assert.equal(searches,3);assert.equal(bundle.bundle.complete,true);assert.equal(bundle.bundle.known_total,150);
 assert.equal(bundle.bundle.budget,200);assert.equal(bundle.recommendations.length,3);
 assert(wantsBundle('Make the total $150',bundle.shopping_mission),'A changed total must keep the set task');
 const failed=await shoppingMode({...options,message:'Build a desk setup for $200 total',
  openai:{responses:{create:async()=>({output_text:JSON.stringify({title:'Desk setup',components:[{label:'Desk',query:'desk',weight:1},{label:'Lamp',query:'lamp',weight:1}]})})}},
  search:async({message})=>message.includes('lamp')?Promise.reject(new Error('Search unavailable')):{recommendations:[offer('desk',50)]}
 });
 assert.equal(failed.bundle.complete,false);assert.equal(failed.recommendations.length,0);assert.deepEqual(failed.bundle.missing,['Lamp']);
 const url='https://www.ebay.com/itm/123';
 let input;
 const link=await shoppingMode({...options,message:'Compare '+url,
  openai:{responses:{create:async(req)=>{input=req;return {output_text:JSON.stringify({title:'Acme Espresso Maker 2-Pack',brand:'Acme',model:'X1',price_value:90,currency:'USD',accessible:true}),sources:[{url}]};}}},
  search:async(args)=>{assert(args.message.includes('2-Pack'));assert.equal(args.responseBudgetMs,35000);return {message:'Compared',recommendations:[offer('a',85)]};}
 });
 assert(input.tools.some(t=>t.type==='web_search'));assert.equal(link.linked_product.price_value,90);assert.equal(link.linked_product.url,url);
 const blocked=await shoppingMode({...options,message:url,openai:{responses:{create:async()=>({output_text:JSON.stringify({title:'Invented identity',accessible:true}),sources:[{url:'https://www.ebay.com/itm/different'}]})}}});
 assert.equal(blocked.recommendations.length,0);assert.match(blocked.message,/could not read/);
 const local=await shoppingMode({...options,message:'https://www.onedailydrop.com/us/deal/42',catalogLink:()=>({id:42,title:'Known product',price_value:44,currency:'USD'}),search:async(args)=>{assert.equal(args.productId,42);return {recommendations:[]};}});
 assert.equal(local.linked_product.title,'Known product');
 const controller=new AbortController();controller.abort();
 await assert.rejects(shoppingMode({...options,message:url,signal:controller.signal,openai:{responses:{create:async()=>{throw controller.signal.reason;}}}}),{name:'AbortError'});
 console.log('Delia shopping modes: one task question, safe evidenced links, carried budget, separate searches, exact totals, shipping uncertainty, missing items and cancellation passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
