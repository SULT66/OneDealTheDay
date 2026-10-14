process.env.MERCHANDISING_FOCUS = 'all';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const Module = require('node:module');
const DAY = 86400000, now = Date.parse('2026-10-13T12:00:00Z');
let calls = 0, failResearch = false, gate = null, chooseFail = false;
function signal(market, id = 'external') { return { id: `${market}-${id}`, market, kind: 'trend', title: 'Observed product interest', queries: ['headphones'], startsAt: new Date(now - DAY).toISOString(), endsAt: new Date(now + 7 * DAY).toISOString(), confidence: 'external_interest', sourceUrls: ['https://example.com/bestsellers'] }; }
const load = Module._load;
Module._load = function(request, parent, ...rest) {
  if (parent?.filename.endsWith('/src/merchandising.js')) {
    if (request === './merchandisingCalendar') return { calendarSignals: () => [] };
    if (request === './merchandisingTrends') return { internalTrendSignals: () => [], researchTrendSignals: async ({ market }) => { calls++; if (gate) await gate; return failResearch ? { status: 'failed', signals: [], reason: 'timeout' } : { status: 'success', signals: [signal(market)] }; } };
    if (request === './merchandisingSelection') return {
      matchesQuery: () => true, signalRejectionReasons: () => [],
      merchandisingDiagnostics: () => ({assessed:0, eligible:0, rejectionCounts:{}, signals:[]}),
      isPromotionEligible: (row, { market, now: at }) => row.market === market && row.availability === 'in_stock' && Number(row.link_last_status || 200) < 400 && Date.parse(row.checked_at) + DAY > at,
      selectMerchandise: (rows, signals, opts) => { if (chooseFail) throw Error('selector unavailable'); return signals.map(s => ({ signal: s, products: rows.filter(r => r.market === opts.market).reverse() })); },
    };
    if (request === './productPresentation') return { PRICE_CONFIDENT_HOURS: 24 };
  }
  return load.call(this, request, parent, ...rest);
};
const { runMerchandising, getMerchandisingShelves, merchandisingStatus } = require('../src/merchandising');
Module._load = load;
function database() {
  const native = new DatabaseSync(':memory:');
  native.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY, market TEXT, title TEXT, checked_at TEXT, availability TEXT, status TEXT DEFAULT 'published');
    CREATE TABLE link_health(product_id INTEGER PRIMARY KEY,last_status INTEGER,consecutive_failures INTEGER,last_error TEXT);`);
  const db = { exec: sql => native.exec(sql), prepare: sql => native.prepare(sql) };
  for (const [id, market] of [[1, 'us'], [2, 'ca']]) db.prepare('INSERT INTO products(id,market,title,checked_at,availability) VALUES (?,?,?,?,?)').run(id, market, 'Headphones', new Date(now).toISOString(), 'in_stock');
  return { db, native };
}
(async () => {
  const { db, native } = database();
  db.prepare('INSERT INTO products(id,market,title,checked_at,availability,status) VALUES (?,?,?,?,?,?)')
    .run(99,'us','Archived offer',new Date(now).toISOString(),'in_stock','archived');
  assert.equal((await runMerchandising(db, { now, research: true })).status, 'success');
  assert.equal(getMerchandisingShelves(db, {now})[0].products.length,1,'Archived rows must never reach the selector');
  assert.equal(calls, 1);
  assert.equal(getMerchandisingShelves(db, { now })[0].products[0].id, 1);
  await runMerchandising(db, { now: now + 3600000, research: true });
  assert.equal(calls, 1, 'research persists a once-per-day throttle');
  await runMerchandising(db, { market: 'ca', now, research: true });
  assert.equal(calls, 2);
  assert.equal(getMerchandisingShelves(db, { market: 'ca', now })[0].products[0].id, 2);
  let discoveryCalls=0;
  const discover=async ({keywords})=>{discoveryCalls++;assert.deepEqual(keywords,['headphones']);return {status:'success',count:1};};
  await runMerchandising(db,{now:now+2*3600000,discover});
  await runMerchandising(db,{now:now+3*3600000,discover});
  assert.equal(discoveryCalls,1,'Repeated manual or hourly checks share the persisted six-hour eBay throttle');
  assert.equal(merchandisingStatus(db,{now}).stages.discovery.details.count,1);
  const failedDiscovery = async()=>{discoveryCalls++;throw new Error('eBay fetch failed: timeout');};
  await runMerchandising(db,{now:now+8*3600000,discover:failedDiscovery});
  assert.equal(getMerchandisingShelves(db,{now:now+8*3600000}).length,1,'Discovery failure must retain valid catalogue shelves');
  await runMerchandising(db,{now:now+8*3600000+1000,discover:failedDiscovery});
  assert.equal(discoveryCalls,2,'Manual clicks must not repeat transient failed discovery');
  await runMerchandising(db,{now:now+9*3600000,discover});
  assert.equal(discoveryCalls,3,'Transient failure is retried at the next hourly sweep');
  // A failed daily attempt must preserve unexpired prior research and throttle retries.
  db.prepare('UPDATE products SET checked_at=?').run(new Date(now + DAY).toISOString());
  failResearch = true;
  await runMerchandising(db, { now: now + DAY, research: true });
  assert.equal(calls, 3);
  assert.equal(getMerchandisingShelves(db, { now: now + DAY }).length, 1);
  await runMerchandising(db, { now: now + DAY + 1000, research: true });
  assert.equal(calls, 3);
  assert.equal(merchandisingStatus(db, { now: now + DAY }).stages.research.status, 'failed');
  // Publication failure rolls back deletions instead of leaving an empty shelf.
  native.exec("CREATE TRIGGER fail_placement BEFORE INSERT ON merchandising_placements BEGIN SELECT RAISE(ABORT,'disk failure'); END");
  assert.equal((await runMerchandising(db, { now: now + DAY + 2000 })).status, 'failed');
  assert.equal(getMerchandisingShelves(db, { now: now + DAY + 2000 }).length, 1);
  native.exec('DROP TRIGGER fail_placement');
  chooseFail = true;
  assert.equal((await runMerchandising(db, { now: now + DAY + 3000 })).status, 'failed');
  chooseFail = false;
  assert.equal(getMerchandisingShelves(db, { now: now + DAY + 3000 }).length, 1);
  // Reads check current stock and health, even between scheduled runs.
  db.prepare("UPDATE products SET availability='out_of_stock' WHERE id=1").run();
  assert.equal(getMerchandisingShelves(db, { now: now + DAY }).length, 0);
  db.prepare("UPDATE products SET availability='in_stock' WHERE id=1").run();
  db.prepare('INSERT INTO link_health VALUES (1,404,1,NULL)').run();
  assert.equal(getMerchandisingShelves(db, { now: now + DAY }).length, 0);
  db.prepare('DELETE FROM link_health').run();
  assert.equal(getMerchandisingShelves(db, { now: now + 2 * DAY + 1 }).length, 0);
  // Both in-process and persisted leases suppress overlapping research costs.
  failResearch = false;
  let release; gate = new Promise(resolve => { release = resolve; });
  const pending = runMerchandising(db, { now: now + 3 * DAY, research: true });
  assert.equal((await runMerchandising(db, { now: now + 3 * DAY, research: true })).status, 'busy');
  const otherHandle = { exec: sql => native.exec(sql), prepare: sql => native.prepare(sql) };
  assert.equal((await runMerchandising(otherHandle, { now: now + 3 * DAY, research: true })).status, 'busy');
  release(); await pending; gate = null;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM merchandising_leases').get().n, 0);
  native.close();
  const ordered = database();
  ordered.db.prepare('INSERT INTO products(id,market,title,checked_at,availability) VALUES (?,?,?,?,?)').run(3,'us','Headphones',new Date(now).toISOString(),'in_stock');
  await runMerchandising(ordered.db,{now,research:true});
  assert.deepEqual(getMerchandisingShelves(ordered.db,{now})[0].products.map(p=>p.id),[3,1],
    'Persisted shelves must preserve selector order rather than sorting by database ID');
  ordered.native.close();
  process.env.MERCHANDISING_FOCUS = 'halloween';
  // One end-to-end seasonal pass uses the real Agents 1–3 modules.
  process.env.EBAY_CLIENT_ID = 'merchandising-test';
  process.env.EBAY_CLIENT_SECRET = 'merchandising-test';
  process.env.EBAY_CAMPAIGN_ID = '1234567890';
  process.env.PUBLIC_PRODUCT_SOURCES = 'ebay';
  delete require.cache[require.resolve('../src/merchandising')];
  const real = require('../src/merchandising');
  const live = new DatabaseSync(':memory:');
  const p = { id: 10, title: 'Halloween Decoration Pumpkin Sculpture', market: 'us', currency: 'USD', source: 'ebay',
    retailer_name: 'eBay', status: 'published', current_price: 40, checked_at: new Date(now).toISOString(),
    image_url: 'https://i.ebayimg.com/pumpkin.jpg', affiliate_url: 'https://www.ebay.com/itm/10',
    availability: 'In stock', shipping_summary: 'Free shipping', return_summary: '30 day returns accepted',
    ebay_sold_quantity:200, rating:4.7, review_count:30, delivery_estimated_at:new Date(now+3*DAY).toISOString(), delivery_country:'US',
    seller_rating: 99.5, seller_feedback_count: 400, category: 'Home' };
  live.exec(`CREATE TABLE products(${Object.keys(p).map(key => `${key} ${typeof p[key] === 'number' ? 'REAL' : 'TEXT'}`).join(',')})`);
  live.prepare(`INSERT INTO products VALUES (${Object.keys(p).map(() => '?').join(',')})`).run(...Object.values(p));
  const realDb = { exec: sql => live.exec(sql), prepare: sql => live.prepare(sql) };
  assert.equal((await real.runMerchandising(realDb, { now })).status, 'success');
  const actualShelf = real.getMerchandisingShelves(realDb, { now });
  assert.equal(actualShelf[0].kind, 'seasonal');
  assert.equal(actualShelf[0].products[0].id, 10);
  assert.equal(actualShelf[0].confidence, 'planning');
  const focused = real.merchandisingStatus(realDb, {now});
  assert.equal(focused.stages.selection.details.signals,1,'Only Halloween reaches selection');
  let focusQueries;
  await real.runMerchandising(realDb,{now,research:true,discover:async({keywords})=>{focusQueries=keywords;return {status:'success',count:1};}});
  assert.equal(focusQueries.length,6,'All six discovery slots belong to Halloween');
  assert(focusQueries.every(q=>q.startsWith('Halloween ')));
  assert.equal(real.merchandisingStatus(realDb,{now}).stages.research.status,'paused');
  await real.runMerchandising(realDb,{now:now+1000,discover:async()=>{throw Error('Focused throttle should prevent a second pass');}});
  assert.equal(real.merchandisingStatus(realDb,{now}).stages.discovery.status,'success');
  const oldDiscovery=real.merchandisingStatus(realDb,{now}).stages.discovery.details;
  realDb.prepare("UPDATE merchandising_status SET details=? WHERE market='us' AND stage='discovery'").run(JSON.stringify({...oldDiscovery,focus:null}));
  await real.runMerchandising(realDb,{now:now+2000,discover:async()=>({status:'busy',reason:'server_settling'})});
  let resumed=0;
  await real.runMerchandising(realDb,{now:now+3000,discover:async()=>{resumed++;return {status:'success',count:1};}});
  assert.equal(resumed,1,'Warm-up must not consume discovery after a campaign change');
  live.close();
  console.log('merchandising: throttle, lease, failed research retention, rollback, market isolation and live eligibility passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
