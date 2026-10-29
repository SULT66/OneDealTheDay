const { SHELVES } = require('./categoryGaps');
const { isHalloweenProduct } = require('./seasonalProductTypes');
const { isHolidaySeason } = require('./holidayCatalog');
const PLAN_ID = 'holiday-catalog-2026-v1';
const TERMS = {
  ...SHELVES,
  'Other Deals':['garden hose','plant stand','storage basket','reusable shopping bag','door mat'],
  'Heating, Cooling & Air Quality':['air purifier','humidifier','ceramic space heater','air purifier filter'],
  'Christmas & New Year':['Christmas tree','Christmas string lights','Christmas ornaments set','Christmas wreath','Christmas garland','advent calendar','Christmas stockings','New Year party decorations'],
};
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
    state={id:PLAN_ID,status:'running',startedAt:new Date().toISOString(),baseline,hiddenIds:[],electronicsTarget:Math.max(0,(baseline.Electronics||0)-500),tasks:[],sources:{}};
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
      if(state.status==='complete'||state.status==='partial')return;
      if(!existing)await snapshot();
      const providers=require('./providers/registry').enabledProviders(config).filter(p=>['ebay','aliexpress'].includes(p.id)&&p.markets.includes('us')).map(p=>p.id);
      if(!providers.length){state.status='partial';state.reason='No configured product search sources';save(state);return;}
      for(const task of state.tasks) {
        if(task.status!=='pending')continue;
        if((counts()[task.category]||0)>=task.target){task.status='complete';save(state);continue;}
        if(isMarketRefreshing('us'))return;
        const terms=TERMS[task.category];
        const keywords=[0,1,2].map(offset=>terms[(task.attempts*3+offset)%terms.length]);
        task.attempts++;task.status='searching';save(state);
        try {
          const result=await (refresh||refreshMarketOnce)({...config,aliexpressMaxProducts:100},'us',{
            providerIds:providers,keywords,allowedCategories:[task.category],curationQuality:true,
            maxNewProducts:Math.max(0,task.target-(counts()[task.category]||0)),
            skipDailySelection:true,skipMerchandising:true,sourceDeadlineMs:150000,
            searchOptions:{detailLimit:180,targetEligible:100,searchLimit:100,strictQueries:true,requestTimeoutMs:15000,maxAttempts:1,searchConcurrency:2,detailConcurrency:3},
          });
          task.lastImported=result?.eligible||0;
          state.sources[task.category]=providers;
          task.status=(counts()[task.category]||0)>=task.target?'complete':task.attempts>=4?'shortfall':'pending';
        }catch(error){task.status=task.attempts>=4?'shortfall':'pending';task.lastError=String(error.message||'Import failed').slice(0,250);}
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
module.exports={PLAN_ID,TERMS,qualified,createHolidayCuration};
