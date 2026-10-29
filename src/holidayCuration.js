const { SHELVES } = require('./categoryGaps');
const { isHalloweenProduct } = require('./seasonalProductTypes');
const { isHolidaySeason } = require('./holidayCatalog');
const PLAN_ID = 'holiday-catalog-2026-v1';
const IMPORT_POLICY = 'holiday-curation-v2-partner-completion';
const TERMS = {
  ...SHELVES,
  'Other Deals':['garden hose','plant stand','storage basket','reusable shopping bag','door mat'],
  'Heating, Cooling & Air Quality':['air purifier','humidifier','ceramic space heater','air purifier filter'],
  'Christmas & New Year':['Christmas tree','Christmas string lights','Christmas ornaments set','Christmas wreath','Christmas garland','advent calendar','Christmas stockings','New Year party decorations'],
};
const EXTRA_TERMS = {
  'Baby & Kids':['baby changing pad','baby swaddle blanket','infant play mat','baby feeding set','baby bath toys','stroller organizer'],
  'Furniture':['side table','storage cabinet','dresser','wardrobe','bookcase','storage bench'],
  'Travel':['travel backpack','passport holder','luggage organizer','weekender bag'],
  'Mattresses & Sleep':['bed pillow set','bedding sheet set','mattress protector','memory foam mattress topper'],
  'Toys & Games':['UNO card game','Monopoly board game','Ravensburger jigsaw puzzle','LEGO flower building set','Melissa Doug puzzle'],
  'Pet Supplies':['dog harness','cat scratching mat','pet water fountain','dog leash'],
  'Automotive':['car trunk organizer','car cleaning brush','car floor mat','tire inflator'],
  'Office':['office desk','standing desk','office chair','desk organizer'],
  'Fashion':['leather belt','fashion scarf','crossbody bag','men wallet','women handbag'],
  'Gifts':['personalized gift','keepsake gift','gift set','photo frame'],
  'Heating, Cooling & Air Quality':['dehumidifier','crawlspace dehumidifier','air scrubber','ventilation fan','exhaust fan'],
  'Sports & Outdoors':['treadmill','walking pad','exercise bike','camping sleeping bag','hunting waders'],
  'Arts & Crafts':['artist paintbrush','watercolor paintbrush','paint brushes','painting canvas'],
  'Health & Beauty':['skin care device','facial massager','IPL hair removal','electric toothbrush'],
  'Home & Kitchen':['coffee maker','espresso machine','home lighting','storage organizer','bathroom shelf'],
};
for (const [category,terms] of Object.entries(EXTRA_TERMS)) TERMS[category]=[...TERMS[category],...terms];
const PARTNER_FEEDS = {
  'Furniture':['feed-tribesigns-us'],
  'Gifts':['feed-giftlab-us','feed-love-is-a-rose-us','feed-grommet-us'],
  'Bikes & Mobility':['feed-mooncool-us','feed-rockbros-us'],
  'Mattresses & Sleep':['feed-king-koil-us'],
  'Heating, Cooling & Air Quality':['feed-alorair-crawlspace-us'],
  'Sports & Outdoors':['feed-fed-fitness-us','feed-tidewe-us','feed-toputure-us'],
  'Home & Kitchen':['feed-argendon-us','feed-lumary-us','feed-simple-project-us','feed-outin-us','feed-grommet-us'],
  'Arts & Crafts':['feed-silver-brush-us'],
  'Health & Beauty':['feed-evenskyn-us'],
  'Office':['feed-tribesigns-us'],
  'Baby & Kids':['feed-grommet-us'],
  'Tools & DIY':['feed-grommet-us'],
  'Other Deals':['feed-grommet-us'],
};
function upgradePlan(state,current) {
  if (state.importPolicy===IMPORT_POLICY) return false;
  for (const task of state.tasks) {
    if ((current[task.category]||0)>=task.target) task.status='complete';
    else if (task.status==='shortfall') {
      task.status='pending';task.attempts=0;task.queryOffset=12;delete task.lastError;
    }
  }
  if (state.status==='partial' && state.tasks.some(task=>task.status==='pending')) state.status='running';
  state.importPolicy=IMPORT_POLICY;
  return true;
}
function qualified(product) {
  if (!product || !/^https:\/\//i.test(product.image_url || '') || !/^https:\/\//i.test(product.affiliate_url || '') || !(Number(product.current_price)>0)) return false;
  if (Number(product.review_count)>0 && Number(product.rating)<4) return false;
  if (product.source==='ebay') {
    const seller=Number(product.seller_rating || 0);
    if ((seller<=5?seller*20:seller)<98 || Number(product.seller_feedback_count || 0)<500) return false;
  }
  return !/\b(?:for parts|not working|broken|replacement screen|digital download)\b/i.test(product.title || '');
}
function createHolidayCuration({db,config,clearCaches=()=>{},refresh}={}) {
  let running=false;
  const {sourceSql,uniqueProductsInOrder}=require('./publicCatalog');
  const ensure=()=>db.exec(`CREATE TABLE IF NOT EXISTS catalog_curation_jobs(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL)`);
  const read=()=>{ensure();const row=db.prepare('SELECT payload FROM catalog_curation_jobs WHERE id=?').get(PLAN_ID);return row?JSON.parse(row.payload):null;};
  const save=state=>{state.updatedAt=new Date().toISOString();db.prepare('INSERT INTO catalog_curation_jobs VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(PLAN_ID,JSON.stringify(state),state.updatedAt);};
  const rows=()=>uniqueProductsInOrder(db.prepare(`SELECT * FROM products WHERE market='us' AND status='published' AND ${sourceSql()} ORDER BY COALESCE(ranking_score,score,0) DESC,id`).all());
  const counts=()=>rows().reduce((out,p)=>(out[p.normalized_category]=(out[p.normalized_category]||0)+1,out),{});
  const snapshot=async()=>{await db.snapshots?.snapshotNow('Holiday catalogue curation');};
  function initialize() {
    let state=read();if(state)return state;
    const baseline=counts();
    state={id:PLAN_ID,status:'running',startedAt:new Date().toISOString(),importPolicy:IMPORT_POLICY,baseline,hiddenIds:[],electronicsTarget:Math.max(0,(baseline.Electronics||0)-500),tasks:[],sources:{}};
    const protectedIds=new Set(db.prepare("SELECT DISTINCT product_id FROM daily_drops WHERE market='us'").all().map(r=>r.product_id));
    const liveUrls=new Set(db.prepare("SELECT affiliate_url FROM live_drops WHERE market='us' AND published=1").all().map(r=>r.affiliate_url));
    const hide=db.prepare("UPDATE products SET status='hidden',updated_at=? WHERE id=? AND status='published'");
    db.transaction(()=>{
      for(const p of db.prepare("SELECT * FROM products WHERE market='us' AND status='published'").all()) {
        if(isHalloweenProduct(p)&&!liveUrls.has(p.affiliate_url)){hide.run(state.startedAt,p.id);state.hiddenIds.push(p.id);}
      }
      // Remove weak/unreviewed entries first. Saved product records and past
      // Daily Drops remain intact; no product row or price history is deleted.
      const candidates=db.prepare(`SELECT * FROM products WHERE market='us' AND status='published' AND normalized_category='Electronics'
        ORDER BY CASE WHEN COALESCE(review_count,0)=0 THEN 0 ELSE 1 END,COALESCE(evidence_confidence,0),COALESCE(ranking_score,score,0),COALESCE(review_count,0),id DESC`).all()
        .filter(p=>!protectedIds.has(p.id)&&!liveUrls.has(p.affiliate_url));
      let cursor=0;
      while((counts().Electronics||0)>state.electronicsTarget&&cursor<candidates.length) {
        const batch=Math.min(50,(counts().Electronics||0)-state.electronicsTarget);
        for(let i=0;i<batch&&cursor<candidates.length;i++,cursor++){hide.run(state.startedAt,candidates[cursor].id);state.hiddenIds.push(candidates[cursor].id);}
      }
      state.tasks=Object.keys(TERMS).filter(category=>category!=='Electronics').map(category=>({category,before:baseline[category]||0,target:category==='Christmas & New Year'?150:Math.max(70,(baseline[category]||0)+50),attempts:0,status:'pending'}))
        .sort((a,b)=>Number(b.category==='Christmas & New Year')-Number(a.category==='Christmas & New Year')||a.before-b.before);
      state.afterRemoval=counts();save(state);
    })();
    clearCaches();return state;
  }
  function publicStatus() {
    const state=read();if(!state)return {status:'pending'};
    const current=counts();
    return {id:PLAN_ID,status:state.status,startedAt:state.startedAt,updatedAt:state.updatedAt,electronics:{before:state.baseline.Electronics||0,current:current.Electronics||0,target:state.electronicsTarget},
      halloweenRemaining:current.Halloween||0,sources:state.sources,tasks:state.tasks.map(({category,before,target,attempts,status})=>({category,before,target,attempts,status,current:current[category]||0,added:Math.max(0,(current[category]||0)-before)}))};
  }
  async function run() {
    if(running||!isHolidaySeason()||!config.isProduction||config.primaryMarket!=='us')return;
    const {isMarketRefreshing,refreshMarketOnce}=require('./refresh');
    if(process.uptime()<Number(process.env.REFRESH_SETTLING_SECONDS??600)||isMarketRefreshing('us'))return;
    running=true;
    try {
      const existing=read();
      const state=existing||initialize();
      if(state.importPolicy!==IMPORT_POLICY && upgradePlan(state,counts()))save(state);
      if(state.status==='complete'||state.status==='partial')return;
      if(!existing)await snapshot();
      const available=require('./providers/registry').enabledProviders(config).filter(p=>p.markets.includes('us'));
      const providers=available.filter(p=>['ebay','aliexpress'].includes(p.id)).map(p=>p.id);
      if(!available.length){state.status='partial';state.reason='No configured product search sources';save(state);return;}
      for(const task of state.tasks) {
        if(task.status!=='pending')continue;
        if((counts()[task.category]||0)>=task.target){task.status='complete';save(state);continue;}
        if(isMarketRefreshing('us'))return;
        const terms=TERMS[task.category];
        const keywords=[0,1,2].map(offset=>terms[((task.queryOffset||0)+task.attempts*3+offset)%terms.length]);
        const providerIds=available.filter(p=>providers.includes(p.id)||(PARTNER_FEEDS[task.category]||[]).includes(p.id)).map(p=>p.id);
        if(!providerIds.length){task.status='shortfall';save(state);continue;}
        task.attempts++;task.status='searching';save(state);
        try {
          const result=await (refresh||refreshMarketOnce)({...config,aliexpressMaxProducts:100},'us',{
            providerIds,keywords,allowedCategories:[task.category],curationQuality:true,
            maxNewProducts:Math.max(0,task.target-(counts()[task.category]||0)),
            skipDailySelection:true,skipMerchandising:true,sourceDeadlineMs:150000,
            searchOptions:{detailLimit:180,targetEligible:100,searchLimit:100,strictQueries:true,requestTimeoutMs:15000,maxAttempts:1,searchConcurrency:2,detailConcurrency:3},
          });
          task.lastImported=result?.eligible||0;
          state.sources[task.category]=providerIds;
          task.status=(counts()[task.category]||0)>=task.target?'complete':task.attempts>=8?'shortfall':'pending';
        }catch(error){task.status=task.attempts>=8?'shortfall':'pending';task.lastError=String(error.message||'Import failed').slice(0,250);}
        clearCaches();save(state);await snapshot();
        // One bounded category batch per pass keeps the public server usable.
        return;
      }
      state.status=state.tasks.some(t=>t.status==='shortfall')?'partial':'complete';save(state);await snapshot();
    } finally {running=false;}
  }
  function start() {
    if(!config.isProduction||!config.liveRefreshEnabled||config.primaryMarket!=='us'||!isHolidaySeason())return;
    // Resume an interrupted batch from its actual current catalogue counts.
    const state=read();if(state){for(const task of state.tasks)if(task.status==='searching')task.status='pending';save(state);}
    const timer=setInterval(()=>run().catch(error=>console.error('[holiday-curation]',error.message)),30000);timer.unref?.();
    const initial=setTimeout(()=>run().catch(error=>console.error('[holiday-curation]',error.message)),Math.max(1000,(Number(process.env.REFRESH_SETTLING_SECONDS??600)-process.uptime())*1000+1000));initial.unref?.();
  }
  return {start,run,publicStatus,initialize};
}
module.exports={PLAN_ID,IMPORT_POLICY,TERMS,PARTNER_FEEDS,upgradePlan,qualified,createHolidayCuration};
