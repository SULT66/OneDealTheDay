const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { internalTrendSignals, researchTrendSignals } = require('../src/merchandisingTrends');
const now = Date.parse('2026-10-13T17:00:00Z'), DAY = 86400000;
const iso = n => new Date(n).toISOString();
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE search_queries(market TEXT,normalized TEXT,searched_at TEXT)');
const insert = db.prepare('INSERT INTO search_queries VALUES(?,?,?)');
function searches(query, current, previous, market = 'us') {
  for (let i = 0; i < current; i++) insert.run(market, query, iso(now - DAY));
  for (let i = 0; i < previous; i++) insert.run(market, query, iso(now - 8 * DAY));
}
searches('standing desk', 9, 4);
searches('lego flowers', 8, 0);
searches('office chair', 5, 0); // too small without a baseline
searches('headphones', 6, 5); // no material growth
searches('password help', 30, 0);
searches('weather', 30, 0);
searches('monitor', 20, 0, 'ca');
searches('standing desk', 8, 0, 'de');
insert.run('us', 'future product', iso(now + DAY));
const internal = internalTrendSignals(db, { now });
assert.deepEqual(internal.map(s => s.title), ['standing desk', 'lego flowers']);
assert.equal(internal[0].confidence, 'observed_interest');
assert.equal(internal[0].evidence.previousSearches, 4);
assert.equal(internalTrendSignals(db, { now, market: 'ca' }).length, 1);
assert.equal(internalTrendSignals(db, { now, market: 'de' }).length, 1);
assert.deepEqual(internalTrendSignals(db, { now, market: 'mx' }), []);
assert.equal(internalTrendSignals(db, { now, limit: 0 }).length, 0);
assert.deepEqual(internalTrendSignals({ prepare() { throw Error('old DB'); } }, { now }), []);

const url = 'https://retailer.example/bestsellers';
const signal = { title: 'LEGO flowers', market: 'us', queries: ['lego flowers'], categories: [],
  startsAt: iso(now), endsAt: iso(now + 7 * DAY), confidence: 'external_interest', sourceUrls: [url],
  evidence: { type: 'retailer_bestseller', summary: 'Current retailer-specific bestseller ranking.', observedAt: iso(now) } };
function response(signals = [signal], citation = url) {
  return { status: 'completed', output_text: JSON.stringify({ signals }), output: [
    { type: 'web_search_call', action: { sources: [{ url: citation }] } },
    { type: 'message', content: [{ type: 'output_text', annotations: [{ type: 'url_citation', url: citation }] }] },
  ] };
}
function mock(value) { return { responses: { create: async (request, options) => {
  assert.equal(request.max_tool_calls, 2); assert.equal(request.store, false);
  assert.equal(options.maxRetries, 0); assert.ok(options.signal);
  return value;
} } }; }
(async () => {
  assert.equal((await researchTrendSignals({ now, market: 'mx', client: mock(response()) })).reason, 'invalid_market_or_date');
  const germanClient = { responses: { create: async request => {
    assert.equal(request.tools[0].user_location.country, 'DE');
    assert.match(request.instructions, /English product-type queries/);
    return response([{ ...signal, market: 'de' }]);
  } } };
  assert.equal((await researchTrendSignals({ now, market: 'de', client: germanClient })).signals[0].market, 'de');
  const result = await researchTrendSignals({ now, client: mock(response()) });
  assert.equal(result.status, 'success'); assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].evidence.type, 'retailer_bestseller');
  const annotationsOnly = response(); annotationsOnly.output.shift();
  assert.equal((await researchTrendSignals({ now, client: mock(annotationsOnly) })).status, 'success');
  const sourcesOnly = response(); sourcesOnly.output.pop();
  assert.equal((await researchTrendSignals({ now, client: mock(sourcesOnly) })).status, 'success');
  assert.equal((await researchTrendSignals({ now, client: { responses: { create: async () => { throw Error('network'); } } } })).reason, 'research_failed');
  const fabricated = await researchTrendSignals({ now, client: mock(response([{ ...signal, sourceUrls: ['https://retailer.example/fabricated'] }])) });
  assert.equal(fabricated.status, 'failed'); assert.equal(fabricated.reason, 'no_valid_cited_signals');
  for (const change of [{ market: 'ca' }, { endsAt: iso(now - DAY) }, { confidence: 'confirmed_sales' },
    { queries: ['password help'] }, { evidence: { ...signal.evidence, observedAt: iso(now - 30 * DAY) } }]) {
    assert.equal((await researchTrendSignals({ now, client: mock(response([{ ...signal, ...change }])) })).status, 'failed');
  }
  assert.equal((await researchTrendSignals({ now, client: mock({ output_text: 'not JSON' }) })).status, 'failed');
  assert.equal((await researchTrendSignals({ now, client: mock({ output_text: '{"signals":{}}' }) })).reason, 'invalid_response');
  assert.equal((await researchTrendSignals({ now, client: mock(response([])) })).status, 'success');
  const timeout = await researchTrendSignals({ now, timeoutMs: 5, client: { responses: { create: () => new Promise(() => {}) } } });
  assert.equal(timeout.reason, 'timeout');
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  assert.equal((await researchTrendSignals({ now })).status, 'disabled');
  if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
  db.close();
  console.log('Merchandising trends: all checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
