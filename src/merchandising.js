// Agent 4: durable, market-scoped shelves. Catalogue prices/scores stay untouched.
const { randomUUID } = require('node:crypto');
const { calendarSignals } = require('./merchandisingCalendar');
const { internalTrendSignals, researchTrendSignals } = require('./merchandisingTrends');
const { selectMerchandise, isPromotionEligible, promotionExpiresAt, merchandisingDiagnostics, matchesQuery, signalRejectionReasons } = require('./merchandisingSelection');
const { PRICE_CONFIDENT_HOURS } = require('./productPresentation');
const { discoveryKeywords, INTERVAL_MS } = require('./merchandisingDiscovery');
const { withVerifiedRetailerTerms } = require('./verifiedRetailerTerms');
const DAY = 86400000;
const active = new WeakMap();
const diagnosticCache = new WeakMap();
const markets = new Set(require('./markets').codes);
const stamp = value => typeof value === 'number' ? value : Date.parse(value);
const json = value => { try { return JSON.parse(value); } catch { return null; } };
function ensureMerchandisingSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS merchandising_signals (
    market TEXT NOT NULL, id TEXT NOT NULL, origin TEXT NOT NULL,
    starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, payload TEXT NOT NULL,
    PRIMARY KEY(market,id));
    CREATE INDEX IF NOT EXISTS merchandising_signals_expiry ON merchandising_signals(market,ends_at);
    CREATE TABLE IF NOT EXISTS merchandising_placements (
    market TEXT NOT NULL, signal_id TEXT NOT NULL, product_id INTEGER NOT NULL,
    position INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    PRIMARY KEY(market,signal_id,product_id));
    CREATE INDEX IF NOT EXISTS merchandising_placements_expiry ON merchandising_placements(market,expires_at);
    CREATE TABLE IF NOT EXISTS merchandising_runs (
    id TEXT PRIMARY KEY, market TEXT NOT NULL, started_at INTEGER NOT NULL,
    finished_at INTEGER, status TEXT NOT NULL, summary TEXT);
    CREATE INDEX IF NOT EXISTS merchandising_runs_market ON merchandising_runs(market,started_at);
    CREATE TABLE IF NOT EXISTS merchandising_status (
    market TEXT NOT NULL, stage TEXT NOT NULL, updated_at INTEGER NOT NULL,
    status TEXT NOT NULL, details TEXT NOT NULL, PRIMARY KEY(market,stage));
    CREATE TABLE IF NOT EXISTS merchandising_leases (
    market TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
}
function transaction(db, operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
function status(db, market, stage, now, state, details = {}) {
  db.prepare(`INSERT INTO merchandising_status VALUES (?,?,?,?,?)
    ON CONFLICT(market,stage) DO UPDATE SET updated_at=excluded.updated_at,status=excluded.status,details=excluded.details`)
    .run(market, stage, now, state, JSON.stringify(details));
}
function storedStatus(db, market, stage) {
  const row = db.prepare('SELECT * FROM merchandising_status WHERE market=? AND stage=?').get(market, stage);
  return row ? { ...row, details: json(row.details) || {} } : null;
}
function replaceSignals(db, market, origin, signals, now) {
  transaction(db, () => {
    db.prepare('DELETE FROM merchandising_signals WHERE market=? AND origin=?').run(market, origin);
    const insert = db.prepare('INSERT OR REPLACE INTO merchandising_signals VALUES (?,?,?,?,?,?)');
    for (const signal of signals) {
      const start = stamp(signal.startsAt), end = stamp(signal.endsAt);
      if (signal.market !== market || !signal.id || !Number.isFinite(start) || !Number.isFinite(end) || end <= now) continue;
      insert.run(market, String(signal.id), origin, start, end, JSON.stringify(signal));
    }
  });
}
function signalsFor(db, market, now, future = false) {
  return db.prepare(`SELECT payload FROM merchandising_signals WHERE market=? AND ends_at>? ${future ? '' : 'AND starts_at<=?'} ORDER BY starts_at,id`)
    .all(...(future ? [market, now] : [market, now, now])).map(row => json(row.payload)).filter(Boolean);
}
function catalogRows(db, market, publishedOnly = false, now = Date.now()) {
  const hasHealth = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='link_health'").get();
  const filter = publishedOnly ? ' AND p.id IN (SELECT product_id FROM merchandising_placements WHERE market=? AND expires_at>?)' : '';
  return db.prepare((hasHealth ? `SELECT p.*,lh.last_status AS link_last_status,
    lh.consecutive_failures AS link_consecutive_failures,lh.last_error AS link_last_error
    FROM products p LEFT JOIN link_health lh ON lh.product_id=p.id WHERE p.market=? AND p.status='published'`
    : "SELECT p.* FROM products p WHERE p.market=? AND p.status='published'") + filter).all(...(publishedOnly ? [market, market, now] : [market]))
    .map(row => withVerifiedRetailerTerms(row, {now}));
}
function priceExpiry(row) {
  return promotionExpiresAt ? stamp(promotionExpiresAt(row)) : stamp(row.checked_at || row.updated_at) + PRICE_CONFIDENT_HOURS * 3600000;
}
function getMerchandisingShelves(db, { market = 'us', now = Date.now(), limit = 3, category } = {}) {
  if (!markets.has(market) || !Number.isFinite(now)) return [];
  ensureMerchandisingSchema(db);
  const rows = new Map(catalogRows(db, market, true, now).map(row => [row.id, row]));
  const placements = db.prepare('SELECT * FROM merchandising_placements WHERE market=? AND expires_at>? ORDER BY position,signal_id,product_id').all(market, now);
  const shelves = [];
  for (const signal of signalsFor(db, market, now)) {
    const products = placements.filter(p => p.signal_id === signal.id).map(p => rows.get(p.product_id))
      .filter(row => row && isPromotionEligible(row, { market, now }) &&
        !signalRejectionReasons(row, signal, {market, now}).length && priceExpiry(row) > now)
      .filter(row => !category || String(row.normalized_category || row.category).toLowerCase() === String(category).toLowerCase());
    if (!products.length) continue;
    shelves.push({ id: signal.id, title: signal.title, kind: signal.kind, confidence: signal.confidence,
      sourceUrls: (signal.sourceUrls || []).filter(url => {
        try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; }
        catch { return false; }
      }).slice(0, 5),
      eventAt: signal.eventAt || null,
      evidenceType: signal.evidence?.type || 'seasonal_planning',
      interestSessions: signal.evidence?.currentSessions || null,
      selectionEvidence: Object.fromEntries(products.map(product => [product.id, {
        matchedQuery: (signal.queries || []).find(q => matchesQuery(product, q)) || '',
        arrivalEstimate: signal.kind === 'seasonal' && Number(signal.metadata?.deliveryLeadDays) ? product.delivery_estimated_at : null,
        destinationPostalCode: product.delivery_postal_code || null,
      }])),
      evidenceSummary: typeof signal.evidence?.summary === 'string' ? signal.evidence.summary : null,
      startsAt: signal.startsAt, endsAt: new Date(Math.min(stamp(signal.endsAt), ...products.map(priceExpiry))).toISOString(), products });
  }
  // A seasonal block and an interest block get an opportunity before repeats.
  shelves.sort((a, b) => a.kind === b.kind ? 0 : a.kind === 'seasonal' || a.kind === 'holiday' ? -1 : 1);
  const selected = [], seenKinds = new Set();
  for (const shelf of shelves) if (!seenKinds.has(shelf.kind)) { selected.push(shelf); seenKinds.add(shelf.kind); }
  for (const shelf of shelves) if (!selected.includes(shelf)) selected.push(shelf);
  return selected.slice(0, Math.max(0, Math.min(10, Number(limit) || 0)));
}
async function runMerchandising(db, { market = 'us', now = Date.now(), research = false,
  horizonDays = 90, limitPerSignal = 6, researchTimeoutMs = 45000, discover, ...researchOptions } = {}) {
  if (!markets.has(market) || !Number.isFinite(now)) throw new Error('Invalid merchandising market or time');
  ensureMerchandisingSchema(db);
  const locks = active.get(db) || new Set(); active.set(db, locks);
  if (locks.has(market)) return { status: 'busy', market };
  locks.add(market);
  const owner = randomUUID(), leaseDuration = 300000;
  let leased = false;
  let previousSignals;
  try {
    leased = transaction(db, () => {
      const lease = db.prepare('SELECT * FROM merchandising_leases WHERE market=?').get(market);
      if (lease && lease.expires_at > now) return false;
      db.prepare('INSERT OR REPLACE INTO merchandising_leases VALUES (?,?,?)').run(market, owner, now + leaseDuration);
      return true;
    });
    if (!leased) return { status: 'busy', market };
    previousSignals = db.prepare('SELECT * FROM merchandising_signals WHERE market=?').all(market);
    db.prepare('INSERT INTO merchandising_runs VALUES (?,?,?,NULL,?,NULL)').run(owner, market, now, 'running');
    const calendar = storedStatus(db, market, 'calendar');
    if (!calendar || calendar.status !== 'success' || now - calendar.updated_at >= 7 * DAY) {
      try {
        const signals = calendarSignals({ market, now, horizonDays });
        replaceSignals(db, market, 'calendar', signals, now);
        status(db, market, 'calendar', now, 'success', { count: signals.length, horizonDays });
      } catch { status(db, market, 'calendar', now, 'failed', { reason: 'calendar_failed' }); }
    }
    try {
      const signals = internalTrendSignals(db, { market, now });
      replaceSignals(db, market, 'internal', signals, now);
      status(db, market, 'internal', now, 'success', { count: signals.length });
    } catch { status(db, market, 'internal', now, 'failed', { reason: 'internal_interest_failed' }); }
    const previousResearch = storedStatus(db, market, 'research');
    if (!research) {
      if (!previousResearch) status(db, market, 'research', now, 'disabled', { reason: 'research_not_enabled' });
    } else if (!previousResearch?.details.attemptedAt || now - previousResearch.details.attemptedAt >= DAY) {
      status(db, market, 'research', now, 'running', { attemptedAt: now });
      let result;
      try { result = await researchTrendSignals({ ...researchOptions, market, now, timeoutMs: Math.min(60000, researchTimeoutMs) }); }
      catch { result = { status: 'failed', reason: 'research_failed', signals: [] }; }
      // Fence a worker whose lease was superseded; never publish its late result.
      if (db.prepare('SELECT owner FROM merchandising_leases WHERE market=?').get(market)?.owner !== owner) return { status: 'lease_lost', market };
      if (result.status === 'success') replaceSignals(db, market, 'research', result.signals || [], now);
      status(db, market, 'research', now, result.status || 'failed', { attemptedAt: now, count: result.signals?.length || 0, reason: result.reason || null });
    }
    let signals = signalsFor(db, market, now);
    const previousDiscovery = storedStatus(db, market, 'discovery');
    if (typeof discover === 'function' &&
        (!previousDiscovery?.details.attemptedAt || now - previousDiscovery.details.attemptedAt >= INTERVAL_MS)) {
      const keywords = discoveryKeywords(signals, {market, now});
      if (keywords.length) {
        const attemptedAt = now;
        status(db, market, 'discovery', now, 'running', {attemptedAt, keywords});
        let result;
        try { result = await discover({market, keywords}); }
        catch { result = {status:'failed', reason:'ebay_discovery_failed'}; }
        if (db.prepare('SELECT owner FROM merchandising_leases WHERE market=?').get(market)?.owner !== owner) return {status:'lease_lost', market};
        // A catalogue import checks its prices after this run starts.
        if (Number.isFinite(stamp(result.observedAt))) now = Math.max(now, stamp(result.observedAt));
        status(db, market, 'discovery', now, result.status || 'failed', {
          attemptedAt: result.status === 'busy' ? previousDiscovery?.details.attemptedAt || null : attemptedAt,
          keywords, count:result.count || 0, reason:result.reason || null,
        });
        signals = signalsFor(db, market, now);
      } else status(db, market, 'discovery', now, 'idle', {reason:'no_active_themes'});
    } else if (!previousDiscovery && typeof discover !== 'function') {
      status(db, market, 'discovery', now, 'disabled', {reason:'scheduled_discovery_not_enabled'});
    }
    const groups = selectMerchandise(catalogRows(db, market), signals, { market, now, limitPerSignal });
    transaction(db, () => {
      db.prepare('DELETE FROM merchandising_placements WHERE market=?').run(market);
      const insert = db.prepare('INSERT INTO merchandising_placements VALUES (?,?,?,?,?)');
      groups.forEach(({ signal, products }, index) => {
        for (const [productIndex, row] of products.entries()) {
          const expires = Math.min(stamp(signal.endsAt), priceExpiry(row));
          if (expires > now && isPromotionEligible(row, { market, now })) insert.run(market, signal.id, row.id, index * Math.max(1, limitPerSignal) + productIndex, expires);
        }
      });
    });
    const count = db.prepare('SELECT COUNT(*) AS count FROM merchandising_placements WHERE market=?').get(market).count;
    status(db, market, 'selection', now, 'success', { signals: signals.length, matchedSignals: groups.filter(g => g.products.length).length, gaps: signals.filter(s => !groups.some(g => g.signal.id === s.id && g.products.length)).map(s => ({ id: s.id, title: s.title })) });
    status(db, market, 'placement', now, 'success', { count });
    db.prepare('UPDATE merchandising_runs SET finished_at=?,status=?,summary=? WHERE id=?').run(Date.now(), 'success', JSON.stringify({ count }), owner);
    return { status: 'success', market, count, shelves: getMerchandisingShelves(db, { market, now }) };
  } catch (error) {
    if (leased) {
      // Signal refreshes precede async research. Restore the previous signal
      // catalogue if publication fails so retained placements still resolve.
      if (previousSignals && db.prepare('SELECT owner FROM merchandising_leases WHERE market=?').get(market)?.owner === owner) transaction(db, () => {
        db.prepare('DELETE FROM merchandising_signals WHERE market=?').run(market);
        const insert = db.prepare('INSERT INTO merchandising_signals VALUES (?,?,?,?,?,?)');
        for (const s of previousSignals) insert.run(s.market, s.id, s.origin, s.starts_at, s.ends_at, s.payload);
      });
      status(db, market, 'placement', now, 'failed', { reason: 'publication_failed_previous_shelves_retained' });
      db.prepare('UPDATE merchandising_runs SET finished_at=?,status=?,summary=? WHERE id=?').run(Date.now(), 'failed', JSON.stringify({ reason: 'merchandising_failed' }), owner);
    }
    return { status: 'failed', market, reason: 'merchandising_failed' };
  } finally {
    if (leased) db.prepare('DELETE FROM merchandising_leases WHERE market=? AND owner=?').run(market, owner);
    locks.delete(market);
  }
}
function merchandisingStatus(db, { market = 'us', now = Date.now() } = {}) {
  if (!markets.has(market)) return null;
  ensureMerchandisingSchema(db);
  const stages = Object.fromEntries(['calendar', 'internal', 'research', 'discovery', 'selection', 'placement'].map(stage => [stage, storedStatus(db, market, stage)]));
  const lastRun = db.prepare('SELECT * FROM merchandising_runs WHERE market=? ORDER BY started_at DESC LIMIT 1').get(market) || null;
  let cache = diagnosticCache.get(db);
  if (!cache) { cache = new Map(); diagnosticCache.set(db, cache); }
  let entry = cache.get(market);
  const runKey = `${lastRun?.id || ''}:${lastRun?.finished_at || ''}`;
  if (!entry || entry.runKey !== runKey || now < entry.at || now - entry.at >= 60000) {
    entry = {at:now,runKey,value:merchandisingDiagnostics(catalogRows(db, market, false, now), signalsFor(db, market, now), {market, now})};
    cache.set(market, entry);
  }
  return { market, stages, roles: { holiday: stages.calendar, demand: { internal: stages.internal, research: stages.research }, catalog: {discovery: stages.discovery, selection: stages.selection}, placement: stages.placement },
    futureEvents: signalsFor(db, market, now, true).filter(s => stamp(s.startsAt) > now).map(({ id, title, preparationAt, startsAt, endsAt }) => ({ id, title, preparationAt, startsAt, endsAt })),
    lastRun,
    diagnostics: {...entry.value, checkedAt:new Date(entry.at).toISOString()},
    shelves: getMerchandisingShelves(db, { market, now }).map(({ products, ...s }) => ({ ...s, productCount: products.length })) };
}
module.exports = { ensureMerchandisingSchema, runMerchandising, getMerchandisingShelves, merchandisingStatus };
