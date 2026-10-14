// Spend a small, separate eBay budget on active occasions, never public reads.
const INTERVAL_MS = 6 * 3600000;
const RETRY_INTERVAL_MS = 3600000;
const POLICY_VERSION = "seasonal-ebay-v7-halloween-search-depth";
function discoveryKeywords(signals, { market, now = Date.now(), limit = 6 } = {}) {
  limit = Math.max(0, Math.min(6, Math.floor(Number(limit) || 0)));
  if (!limit) return [];
  const active = (signals || []).filter(s => s.market === market &&
    Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt))
    .sort((a, b) => (a.kind === 'seasonal' ? 0 : 1) - (b.kind === 'seasonal' ? 0 : 1));
  const window = Math.floor(now / INTERVAL_MS);
  const collect = (themes, allowance) => {
    const groups = themes.map(s => [...new Set((s.queries || []).filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()))]);
    const keywords = [];
    if (!allowance) return keywords;
    for (let index = 0; index < Math.max(0, ...groups.map(g => g.length)); index++) {
      for (const group of groups) {
        if (index >= group.length) continue;
        const query = group[(index + window) % group.length];
        if (!keywords.includes(query)) keywords.push(query);
        if (keywords.length >= allowance) return keywords;
      }
    }
    return keywords;
  };
  // Reserve four slots for active seasonal occasions before interest themes.
  // Otherwise six trend briefs can leave a holiday with only one search.
  const seasonal = collect(active.filter(s => s.kind === 'seasonal'), Math.min(4, limit));
  const interests = collect(active.filter(s => s.kind === 'trend'), limit - seasonal.length);
  return [...new Set([...seasonal, ...interests, ...collect(active, limit)])].slice(0, limit);
}

async function discoverEbay(config, { market, keywords, signals = [], now = Date.now() }) {
  if (!config.ebayClientId || !config.ebayClientSecret || !/^\d{10}$/.test(config.ebayCampaignId || '')) {
    return { status: 'disabled', reason: 'ebay_not_configured' };
  }
  // Share the existing production warm-up window with catalogue refreshes.
  // A postponed pass must not consume the persisted discovery allowance.
  if (config.isProduction && process.uptime() < Number(process.env.REFRESH_SETTLING_SECONDS ?? 600)) {
    return { status: 'busy', reason: 'server_settling' };
  }
  const { isMarketRefreshing, refreshMarketOnce } = require('./refresh');
  if (isMarketRefreshing(market)) return { status: 'busy', reason: 'catalog_refresh_running' };
  const halloween = signals.some(s => s.metadata?.eventKey === 'halloween' && Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt));
  const result = await refreshMarketOnce(config, market, {
    providerIds: ['ebay'], keywords, skipDailySelection: true, skipMerchandising: true,
    searchOptions: { preferredItems: halloween ? require('./merchandisingSeeds').activeSeeds({market,now}) : [],
      detailLimit: halloween ? 600 : 24, targetEligible: halloween ? 240 : 12, searchLimit: halloween ? 100 : 20, strictQueries: true,
      requestTimeoutMs: 20000, maxAttempts: 2, searchConcurrency: 2, detailConcurrency: 4 },
    sourceDeadlineMs: 180000,
  });
  return { status: 'success', count: result.eligible, keywords, observedAt:new Date().toISOString() };
}

module.exports = { POLICY_VERSION, INTERVAL_MS, RETRY_INTERVAL_MS, discoveryKeywords, discoverEbay };
