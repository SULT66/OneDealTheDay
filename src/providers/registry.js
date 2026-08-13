const affiliateFeed = require("./affiliateFeed");

const normalizeTokenText = value => String(value || "")
  .normalize("NFKD")
  .replace(/([A-Za-z])[\u0300-\u036f]+/g, "$1")
  .normalize("NFC");

function nativeProviders(config) {
  const providers = [];
  if (config.ebayClientId && config.ebayClientSecret && /^\d{10}$/.test(config.ebayCampaignId)) {
    providers.push({
      id:"ebay",
      source:"ebay",
      name:"eBay Browse API",
      markets:["us", "ca", "uk", "fr", "de"],
      search:({market, keywords = market.searchKeywords, detailLimit, targetEligible}) => require("./ebay").searchProducts({
        clientId:config.ebayClientId,
        clientSecret:config.ebayClientSecret,
        campaignId:config.ebayCampaignId,
        environment:config.ebayEnvironment,
        keywords,
        market,
        detailLimit,
        targetEligible
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
      search:({market, keywords = market.searchKeywords}) => require("./rainforest").searchProducts({
        apiKey:config.rainforestApiKey,
        affiliateTag:market.affiliateTag,
        keywords,
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
      search:({market, keywords = market.searchKeywords}) => require("./walmart").searchProducts({
        apiKey:config.bluecartApiKey,
        affiliateTemplate:config.walmartAffiliateTemplateForMarket(market.code),
        keywords,
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
    search:({market, keywords}) => affiliateFeed.searchProducts({definition, market, keywords})
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

// Delia uses the same approved provider registry as the catalog refresh, but
// searches the shopper's active mission instead of the scheduled broad
// keywords. Provider failures are isolated so one unavailable store never
// collapses the complete multi-retailer answer.
async function searchForAssistant(config, {query, queries, market, perSourceLimit = 12}) {
  const keywords = [...new Set([
    ...(Array.isArray(queries) ? queries : []),
    query,
  ].map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8);
  if (!keywords.length) return [];
  const queryTokens = new Set(normalizeTokenText(keywords.join(" "))
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || []);
  const providers = providersForMarket(config, market);
  if (!providers.length) return [];
  const settled = await Promise.allSettled(providers.map(provider =>
    provider.search({
      market,
      keywords,
      detailLimit:18,
      targetEligible:6
    })
  ));
  return settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const provider = providers[index];
    return (Array.isArray(result.value) ? result.value : [])
      .map(product => ({...product, source:product.source || provider.source}))
      .map(product => {
        const productTokens = new Set(normalizeTokenText(`${product.title || ""} ${product.brand || ""} ${product.category || ""} ${product.model_number || ""}`)
          .toLowerCase()
          .match(/[\p{L}\p{N}]+/gu) || []);
        const relevance = [...queryTokens].filter(token => productTokens.has(token)).length;
        return {product, relevance};
      })
      .filter(entry => entry.relevance > 0)
      .sort((left, right) => right.relevance - left.relevance)
      .slice(0, perSourceLimit)
      .map(entry => entry.product);
  });
}

module.exports = { enabledProviders, feedProviders, nativeProviders, providersForMarket, searchAll, searchForAssistant };
