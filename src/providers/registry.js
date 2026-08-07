const affiliateFeed = require("./affiliateFeed");

function nativeProviders(config) {
  const providers = [];
  if (config.ebayClientId && config.ebayClientSecret && /^\d{10}$/.test(config.ebayCampaignId)) {
    providers.push({
      id:"ebay",
      source:"ebay",
      name:"eBay Browse API",
      markets:["us", "ca", "uk", "fr", "de"],
      search:({market}) => require("./ebay").searchProducts({
        clientId:config.ebayClientId,
        clientSecret:config.ebayClientSecret,
        campaignId:config.ebayCampaignId,
        environment:config.ebayEnvironment,
        keywords:market.searchKeywords,
        market
      })
    });
  }
  if (config.rainforestApiKey) {
    providers.push({
      id:"amazon",
      source:"amazon",
      name:"Amazon product API",
      markets:["us", "ca", "uk", "fr", "de"],
      configuredFor:market => Boolean(market.affiliateTag),
      search:({market}) => require("./rainforest").searchProducts({
        apiKey:config.rainforestApiKey,
        affiliateTag:market.affiliateTag,
        keywords:market.searchKeywords,
        market
      })
    });
  }
  if (config.bluecartApiKey) {
    providers.push({
      id:"walmart",
      source:"walmart",
      name:"Walmart product API",
      markets:["us", "ca"],
      configuredFor:market => Boolean(config.walmartAffiliateTemplateForMarket(market.code)),
      search:({market}) => require("./walmart").searchProducts({
        apiKey:config.bluecartApiKey,
        affiliateTemplate:config.walmartAffiliateTemplateForMarket(market.code),
        keywords:market.searchKeywords,
        market
      })
    });
  }
  return providers;
}

function feedProviders(config) {
  return (config.affiliateFeeds || []).map(definition => ({
    id:`feed-${definition.id}`,
    source:definition.source,
    name:`${definition.retailerName} ${definition.network} feed`,
    markets:definition.markets,
    search:({market}) => affiliateFeed.searchProducts({definition, market})
  }));
}

function providersForMarket(config, market) {
  return [...nativeProviders(config), ...feedProviders(config)].filter(provider =>
    provider.markets.includes(market.code) && (!provider.configuredFor || provider.configuredFor(market))
  );
}

function enabledProviders(config) {
  const markets = (config.markets || []).map(code => config.marketConfig(code));
  const byId = new Map();
  for (const market of markets) {
    for (const provider of providersForMarket(config, market)) {
      const existing = byId.get(provider.id) || {...provider, markets:[]};
      if (!existing.markets.includes(market.code)) existing.markets.push(market.code);
      byId.set(provider.id, existing);
    }
  }
  return [...byId.values()];
}

async function searchAll(config, market) {
  const providers = providersForMarket(config, market);
  if (!providers.length) throw new Error(`No approved retailer API or affiliate feed is configured for ${market.name}`);
  const settled = await Promise.allSettled(providers.map(provider => provider.search({market})));
  const products = [];
  const reports = settled.map((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      return {id:provider.id, source:provider.source, name:provider.name, status:"failed", found:0, error:result.reason?.message || "refresh failed"};
    }
    const normalized = (Array.isArray(result.value) ? result.value : [])
      .map(product => ({...product, source:provider.source}))
      .slice(0, config.maxProductsPerSource || 500);
    products.push(...normalized);
    return {id:provider.id, source:provider.source, name:provider.name, status:"success", found:normalized.length, error:""};
  });
  if (!products.length) {
    const message = reports.map(report => `${report.name}: ${report.error || "no products"}`).join(" | ");
    const error = new Error(`All ${market.name} retailer sources failed. ${message}`);
    error.sourceReports = reports;
    throw error;
  }
  return {products, reports};
}

module.exports = { enabledProviders, feedProviders, nativeProviders, providersForMarket, searchAll };
