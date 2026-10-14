const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.MERCHANDISING_FOCUS = 'halloween';
process.env.PORT = '18137';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odd-merch-api-'));
process.env.SUPPORTED_MARKETS = 'us,ca';
process.env.WEBSITE_SITE_NAME = 'odd-merchandising-api-test';
process.env.ADMIN_KEY = 'merchandising-api-test-key';
process.env.MERCHANDISING_RESEARCH_MARKETS = 'us';
process.env.EBAY_CLIENT_ID = 'test-client-id';
process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
process.env.EBAY_CAMPAIGN_ID = '5339179772';
delete process.env.OPENAI_API_KEY;
// Model a connected source without executing retailer refreshes or cron jobs.
const config = require('../src/config');
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
const db = require('../src/db');
const { ensureMerchandisingSchema } = require('../src/merchandising');
ensureMerchandisingSchema(db);
const now = Date.now();
const product = {
  external_id: 'us:ebay:merchandising-api', provider_external_id: 'ebay:merchandising-api',
  market: 'us', title: 'Pumpkin Halloween Decoration Sculpture', category: 'Home & Kitchen',
  normalized_category: 'Home & Kitchen', currency: 'USD', source: 'ebay',
  retailer_name: 'eBay', status: 'published', current_price: 40,
  checked_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(),
  image_url: 'https://i.ebayimg.com/pumpkin.jpg',
  affiliate_url: 'https://www.ebay.com/itm/123456789?campid=5339179772',
  availability: 'In stock', shipping_summary: 'Free shipping', return_summary: '30 day returns accepted',
  delivery_estimated_at:new Date(now+3*86400000).toISOString(), delivery_country:'US',
  ebay_sold_quantity:200, rating:4.7, review_count:30, seller_rating: 99.5, seller_feedback_count: 400,
};
const inserted = db.prepare(`INSERT INTO products(${Object.keys(product).join(',')}) VALUES(${Object.keys(product).map(() => '?').join(',')})`)
  .run(...Object.values(product));
const productId = Number(inserted.lastInsertRowid);
const signal = {id: 'api-us-halloween-2026', market: 'us', title: 'Test seasonal shelf', kind: 'seasonal',
  metadata:{eventKey:'halloween'}, confidence: 'planning', queries: ['Halloween decoration'], categories: [], sourceUrls: [],
  startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 86400000).toISOString()};
db.prepare('INSERT INTO merchandising_signals VALUES(?,?,?,?,?,?)').run('us',signal.id,'calendar',now-60000,now+86400000,JSON.stringify(signal));
db.prepare('INSERT INTO merchandising_placements VALUES(?,?,?,?,?)').run('us',signal.id,productId,0,now+86400000);
const unrelated = {...signal,id:'api-winter',title:'Unrelated winter shelf',metadata:{eventKey:'winter-home'}};
db.prepare('INSERT INTO merchandising_signals VALUES(?,?,?,?,?,?)').run('us',unrelated.id,'calendar',now-60000,now+86400000,JSON.stringify(unrelated));
db.prepare('INSERT INTO merchandising_placements VALUES(?,?,?,?,?)').run('us',unrelated.id,productId,1,now+86400000);
require('../app');
const base = `http://127.0.0.1:${process.env.PORT}`;
const headers = {'X-Admin-Key':process.env.ADMIN_KEY};
async function get(route, options) {
  const response = await fetch(base + route, options);
  return {response, body: await response.json()};
}
(async () => {
  for (let attempt=0;attempt<200;attempt++) {
    try {if ((await fetch(base+'/api/status')).ok) break;} catch {}
    if (attempt === 199) throw new Error('Test server did not start');
    await new Promise(resolve => setTimeout(resolve,50));
  }
  const publicResult = await get('/api/merchandising?market=us');
  assert.equal(publicResult.response.status,200);
  assert.equal(publicResult.body.shelves.length,1);
  assert.equal(publicResult.body.shelves[0].products[0].id,productId);
  assert.equal(publicResult.body.shelves[0].selectionEvidence[productId].matchedQuery,'Halloween decoration');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM merchandising_runs').get().n,0,'Public reads must not start research');
  assert.equal((await get('/api/merchandising?market=ca')).body.shelves.length,0);
  assert.equal((await get('/api/merchandising?market=us&category=home%20%26%20kitchen')).body.shelves.length,1,'Case-normalized category must retain matching shelves');
  assert.equal((await get('/api/merchandising?market=us&category=Electronics')).body.shelves.length,0);
  const home = await fetch(base+'/us');
  assert.equal(home.status,200);
  const homeHtml = await home.text();
  assert(homeHtml.includes('Test seasonal shelf'),'Homepage must render the selected shelf');
  assert(homeHtml.includes('Halloween Pick'),'Homepage must render the campaign badge inside the card');
  assert(homeHtml.includes('sold · eBay estimate'),'Sales badge must preserve its evidence qualification');
  assert(!homeHtml.includes('Unrelated winter shelf'),'Homepage must suppress previously placed unrelated themes');
  assert(homeHtml.includes('data-merch-placement="seasonal_card"'),'Shelf cards must carry tracking attribution');
  assert(homeHtml.includes('Product reviews, price and buying terms checked'),'Homepage must explain why a product was selected');
  const collection=await get('/api/merchandising?market=us&collection=halloween');
  assert.equal(collection.body.total,1);
  assert.equal(collection.body.products[0].id,productId);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM merchandising_runs').get().n,0,'Collection reads never trigger discovery');
  assert.equal((await get('/api/merchandising?market=us&collection=halloween&q=unrelated')).body.total,0);
  const cataloguePage=await fetch(base+'/us/halloween');
  assert.equal(cataloguePage.status,200);
  const catalogueHtml=await cataloguePage.text();
  assert(catalogueHtml.includes('Halloween finds') && catalogueHtml.includes('Halloween Pick'),'Collection must render its real products and campaign badge');
  const categoryPage = await fetch(base+'/us/category/home-kitchen');
  assert.equal(categoryPage.status,200);
  assert((await categoryPage.text()).includes('Test seasonal shelf'),'First category page must render its matching shelf');
  assert.equal((await get('/api/admin/merchandising?market=us')).response.status,401);
  const admin = await get('/api/admin/merchandising?market=us',{headers});
  assert.equal(admin.response.status,200);
  assert.equal(admin.body.performance.purchasesAvailable,false);
  assert.equal(admin.body.status.diagnostics.signals[0].matched,1);
  assert.equal(admin.body.status.diagnostics.signals[0].eligible,1);
  assert.equal(publicResult.body.diagnostics,undefined,'Rejection diagnostics must be admin-only');
  assert.equal((await get('/api/admin/merchandising?market=mx',{headers})).response.status,400);
  // Real event ingestion preserves the new shelf attribution.
  for (const sessionId of ['merch-api-real-session','internal_merch-api-own-session']) {
    const response = await fetch(base+'/api/click-events',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({eventId:crypto.randomUUID(),sessionId,productId,sourcePage:'home',placement:'seasonal_card',action:'view_details'})});
    assert.equal(response.status,204);
  }
  const metrics = (await get('/api/admin/merchandising?market=us',{headers})).body.performance;
  assert.equal(metrics.shelves.find(s=>s.placement==='seasonal_card').detailClicks,1,'Owner clicks must be excluded');
  // Archived and expired products must disappear without waiting for a scheduled run.
  db.prepare("UPDATE products SET availability='Out of stock' WHERE id=?").run(productId);
  assert.equal((await get('/api/merchandising?market=us')).body.shelves.length,0);
  db.prepare('UPDATE products SET availability=?,checked_at=? WHERE id=?').run('In stock',new Date(now-2*86400000).toISOString(),productId);
  assert.equal((await get('/api/merchandising?market=us')).body.shelves.length,0);
  const run = await get('/api/admin/merchandising/run',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({market:'us'})});
  assert.equal(run.response.status,202);
  await new Promise(resolve=>setTimeout(resolve,100));
  const status = (await get('/api/admin/merchandising?market=us',{headers})).body.status;
  assert.equal(status.stages.research.status,'paused');
  assert.equal(status.stages.placement.status,'success');
  console.log('Merchandising API: public reads, auth, categories, metrics, live expiry and no-key run passed');
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
