// Spend a small, separate eBay budget on active occasions, never public reads.
const INTERVAL_MS = 6 * 3600000;
function discoveryKeywords(signals, { market, now = Date.now(), limit = 6 } = {}) {
  limit = Math.max(0, Math.min(6, Math.floor(Number(limit) || 0)));
  if (!limit) return [];
  const active = (signals || []).filter(s => s.market === market &&
    Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt))
    .sort((a, b) => (a.kind === 'seasonal' ? 0 : 1) - (b.kind === 'seasonal' ? 0 : 1));
  const groups = active.map(s => [...new Set((s.queries || []).filter(q => typeof q === 'string' && q.trim()).map(q => q.trim()))]);
  const keywords = [];
  // Round-robin across themes, rotating within each so a broad winter theme
  // cannot consume Halloween's entire allowance on every pass.
  const window = Math.floor(now / INTERVAL_MS);
  for (let index = 0; index < Math.max(0, ...groups.map(g => g.length)); index++) {
    for (const group of groups) {
      if (index >= group.length) continue;
      const query = group[(index + window) % group.length];
      if (!keywords.includes(query)) keywords.push(query);
      if (keywords.length >= limit) return keywords.slice(0, limit);
    }
  }
  return keywords;
}

async function discoverEbay(config, { market, keywords }) {
  if (!config.ebayClientId || !config.ebayClientSecret || !/^\d{10}$/.test(config.ebayCampaignId || '')) {
    return { status: 'disabled', reason: 'ebay_not_configured' };
  }
  const { isMarketRefreshing, refreshMarketOnce } = require('./refresh');
  if (isMarketRefreshing(market)) return { status: 'busy', reason: 'catalog_refresh_running' };
  const result = await refreshMarketOnce(config, market, {
    providerIds: ['ebay'], keywords, skipDailySelection: true, skipMerchandising: true,
    searchOptions: { detailLimit: 60, targetEligible: 24, strictQueries: true },
    sourceDeadlineMs: 75000,
  });
  return { status: 'success', count: result.eligible, keywords, observedAt:new Date().toISOString() };
}

module.exports = { INTERVAL_MS, discoveryKeywords, discoverEbay };
