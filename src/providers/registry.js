const affiliateFeed = require("./affiliateFeed");

/* How long any one source may hold up a catalogue refresh. Eight minutes is
   comfortably more than a healthy source needs and far less than the hour a
   run took when nothing was watching. */
const PROVIDER_DEADLINE_MS = Number(process.env.SOURCE_REFRESH_DEADLINE_MS || 8 * 60 * 1000);
const { normalizeCatalogProduct } = require("../catalogTaxonomy");

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
      /* No keywords passed means the broad scheduled sweep, which takes a
         rotating slice of the list. A shopper's own query arrives with its
         keywords and is searched in full. */
      search:({market, keywords, detailLimit, targetEligible, signal}) => require("./ebay").searchProducts({
        clientId:config.ebayClientId,
        clientSecret:config.ebayClientSecret,
        campaignId:config.ebayCampaignId,
        environment:config.ebayEnvironment,
        keywords:keywords || market.searchKeywords,
        rotate:!keywords,
        market,
        detailLimit,
        targetEligible,
        signal
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
  if (config.rakutenClientId && config.rakutenClientSecret && config.rakutenPublisherSid) {
    providers.push({
      id:"newegg",
      source:"newegg",
      name:"Newegg via Rakuten Product Search",
      markets:["us"],
      search:({market, keywords = config.rakutenNeweggKeywords}) => require("./rakutenNewegg").searchProducts({
        clientId:config.rakutenClientId,
        clientSecret:config.rakutenClientSecret,
        publisherSid:config.rakutenPublisherSid,
        mid:config.rakutenNeweggMid,
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
    catalogLimit:definition.maxProducts,
    assistantLiveSearch:false,
    search:({market, keywords, signal}) => affiliateFeed.searchProducts({definition, market, keywords, signal})
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

async function runWithDeadline(provider, market) {
  const controller = new AbortController();
  const message = `${provider.name} did not finish within ${Math.round(PROVIDER_DEADLINE_MS / 60000)} minutes`;
  const timer = setTimeout(() => controller.abort(new Error(message)), PROVIDER_DEADLINE_MS);
  timer.unref?.();
  try {
    return await Promise.race([
      provider.search({market, signal:controller.signal}),
      new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error(message)), {once:true});
      }),
    ]);
  } finally {
    clearTimeout(timer);
    /* Also on success: nothing is outstanding then, and it costs nothing to
       guarantee that no request outlives the run that made it. */
    controller.abort();
  }
}

async function searchAll(config, market, {providerIds = []} = {}) {
  const selectedIds = new Set((providerIds || []).map(value => String(value || "").trim()).filter(Boolean));
  const providers = providersForMarket(config, market).filter(provider =>
    !selectedIds.size || selectedIds.has(provider.id)
  );
  if (!providers.length) throw new Error(`No approved retailer API or affiliate feed is configured for ${market.name}`);
  /*
   * A deadline per source, because one slow source must not cost the run.
   *
   * There was no bound anywhere: a nightly refresh ran for 57 minutes while
   * the workflow watching it gave up at 25 and reported a failure against a
   * catalogue that was still being written. Every individual HTTP call has a
   * timeout; what was missing was a limit on how many of them one source may
   * make us wait for.
   *
   * A source that runs over is reported as failed and the others still land.
   * Half a catalogue refreshed on time is worth more than all of it at some
   * unknown hour, and the report says plainly which source ran out.
   *
   * The deadline cancels the work rather than merely walking away from it.
   * Racing a promise only stops the waiting: the abandoned eBay run carried on
   * calling the Browse API in the background, and two of those left running at
   * once spent the day's whole allowance, which took down all five markets.
   */
  const settled = await Promise.allSettled(providers.map(provider =>
    runWithDeadline(provider, market)
  ));
  const products = [];
  const reports = settled.map((result, index) => {
    const provider = providers[index];
    if (result.status === "rejected") {
      return {id:provider.id, source:provider.source, name:provider.name, status:"failed", found:0, error:result.reason?.message || "refresh failed"};
    }
    const sourceLimit = Number(provider.catalogLimit) > 0
      ? Number(provider.catalogLimit)
      : config.maxProductsPerSource || 500;
    const normalized = (Array.isArray(result.value) ? result.value : [])
      .map(product => normalizeCatalogProduct({...product, source:provider.source}))
      .slice(0, sourceLimit);
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
async function searchForAssistant(config, {query, queries, market, signal, perSourceLimit = 12}) {
  const keywords = [...new Set([
    ...(Array.isArray(queries) ? queries : []),
    query,
  ].map(value => String(value || "").trim()).filter(Boolean))].slice(0, 8);
  if (!keywords.length) return [];
  const queryTokens = new Set(normalizeTokenText(keywords.join(" "))
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || []);
  // Affiliate feeds are already refreshed into the verified catalog. Parsing
  // a complete compressed feed inside an HTTP chat request can block Node's
  // event loop, so Delia searches only native live APIs here and reads feed
  // products from searchCatalog instead.
  const providers = providersForMarket(config, market).filter(
    provider => provider.assistantLiveSearch !== false,
  );
  if (!providers.length) return [];
  const settled = await Promise.allSettled(providers.map(provider =>
    provider.search({
      market,
      keywords,
      signal,
      detailLimit:18,
      targetEligible:6
    })
  ));
  return settled.flatMap((result, index) => {
    if (result.status !== "fulfilled") return [];
    const provider = providers[index];
    return (Array.isArray(result.value) ? result.value : [])
      .map(product => normalizeCatalogProduct({...product, source:product.source || provider.source}))
      .map(product => {
        const productTokens = new Set(normalizeTokenText(`${product.title || ""} ${product.brand || ""} ${product.normalized_category || ""} ${product.category || ""} ${product.model_number || ""}`)
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
