const RETAILERS = Object.freeze([
  {id:"amazon", name:"Amazon", network:"Amazon Associates", markets:["us", "ca", "uk", "fr", "de"], nativeProvider:"amazon"},
  {id:"ebay", name:"eBay", network:"eBay Partner Network", markets:["us", "ca", "uk", "fr", "de"], nativeProvider:"ebay"},
  {id:"walmart", name:"Walmart", network:"Impact / Rakuten", markets:["us", "ca"]},
  {id:"target", name:"Target", network:"Impact", markets:["us"]},
  {id:"best-buy", name:"Best Buy", network:"Best Buy / Impact", markets:["us", "ca"]},
  {id:"home-depot", name:"Home Depot", network:"Impact", markets:["us", "ca"]},
  {id:"lowes", name:"Lowe's", network:"Impact", markets:["us", "ca"]},
  {id:"wayfair", name:"Wayfair", network:"CJ Affiliate", markets:["us", "ca", "uk", "de"]},
  {id:"aliexpress", name:"AliExpress", network:"AliExpress Portals", markets:["us", "ca", "uk", "fr", "de"]},
  {
    id:"tribesigns",
    name:"Tribesigns",
    network:"Awin",
    markets:["us"],
    feedPolicy:{
      excludeTitleTerms:["not sold separately", "not for sale", "non-delivery"]
    }
  },
  {
    id:"mooncool",
    name:"Mooncool",
    network:"Awin",
    markets:["us", "ca"],
    feedPolicy:{
      categoryLeaves:["Bicycles", "Tricycles"],
      excludeTitleTerms:["not sold separately", "not for sale", "non-delivery"]
    }
  },
  {
    id:"giftlab",
    name:"Giftlab",
    network:"Awin",
    markets:["us"],
    // Giftlab's current US feed is small enough to keep in full after the
    // safety policy below. Recommendation diversity is enforced separately,
    // so catalog ingestion does not need to discard most of the assortment.
    maxCatalogProducts:3000,
    feedPolicy:{
      excludeCategoryLeaves:["Lingerie"],
      excludeTitleTerms:[
        "not sold separately", "not for sale", "non-delivery",
        "sexy", "nude", "naked", "penis", "vagina", "dildo",
        "vibrator", "erotic", "porn", "fuck", "boob"
      ]
    }
  },
  {
    id:"king-koil",
    name:"King Koil",
    network:"Awin",
    markets:["us"],
    feedPolicy:{
      categoryLeaves:["Mattresses"],
      excludeTitleTerms:["not sold separately", "not for sale", "non-delivery"]
    }
  },
  {id:"currys", name:"Currys", network:"Awin", markets:["uk"]},
  {id:"ao", name:"AO.com", network:"Awin", markets:["uk"]},
  {id:"fnac", name:"Fnac", network:"Awin", markets:["fr"]},
  {id:"cdiscount", name:"Cdiscount", network:"Effiliation", markets:["fr"]},
  {id:"darty", name:"Darty", network:"Effinity", markets:["fr"]},
  {id:"mediamarkt", name:"MediaMarkt", network:"Awin / Easy Marketing", markets:["de"]},
  {id:"saturn", name:"Saturn", network:"Awin / Easy Marketing", markets:["de"]},
  {id:"otto", name:"OTTO", network:"Awin", markets:["de"]},
  {id:"alternate", name:"ALTERNATE", network:"Awin", markets:["de"]},
  {id:"samsung", name:"Samsung", network:"Impact", markets:["ca"]}
]);

function environmentPrefix(retailerId, marketCode) {
  return `AFFILIATE_FEED_${String(retailerId).replace(/-/g, "_").toUpperCase()}_${String(marketCode).toUpperCase()}`;
}

function optionalProductLimit(value, fallback = null) {
  const selected = value == null || String(value).trim() === "" ? fallback : value;
  const parsed = Number(selected);
  return Number.isFinite(parsed) ? Math.max(50, Math.min(10000, Math.round(parsed))) : null;
}

function feedDefinitions(env = process.env) {
  const definitions = [];
  for (const retailer of RETAILERS) {
    for (const market of retailer.markets) {
      const prefix = environmentPrefix(retailer.id, market);
      const url = String(env[`${prefix}_URL`] || "").trim();
      if (!url) continue;
      definitions.push({
        id:`${retailer.id}-${market}`,
        source:`feed-${retailer.id}`,
        retailerId:retailer.id,
        retailerName:retailer.name,
        network:retailer.network,
        markets:[market],
        url,
        format:String(env[`${prefix}_FORMAT`] || "auto").trim().toLowerCase(),
        headersJson:String(env[`${prefix}_HEADERS_JSON`] || "").trim(),
        fieldMapJson:String(env[`${prefix}_FIELD_MAP_JSON`] || "").trim(),
        maxProducts:optionalProductLimit(env[`${prefix}_MAX_PRODUCTS`], retailer.maxCatalogProducts),
        feedPolicy:retailer.feedPolicy || null
      });
    }
  }
  const customJson = String(env.AFFILIATE_FEEDS_JSON || "").trim();
  if (customJson) {
    let customFeeds;
    try {
      customFeeds = JSON.parse(customJson);
    } catch (error) {
      throw new Error(`AFFILIATE_FEEDS_JSON is invalid: ${error.message}`);
    }
    if (!Array.isArray(customFeeds)) throw new Error("AFFILIATE_FEEDS_JSON must be an array");
    for (const custom of customFeeds) {
      const retailerId = String(custom?.retailerId || custom?.id || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      const markets = [...new Set((Array.isArray(custom?.markets) ? custom.markets : [custom?.market])
        .map(value => String(value || "").trim().toLowerCase())
        .filter(value => ["us", "ca", "uk", "fr", "de"].includes(value)))];
      const retailerName = String(custom?.retailerName || custom?.name || "").trim();
      const url = String(custom?.url || "").trim();
      if (!retailerId || !retailerName || !url || !markets.length) {
        throw new Error("Every custom affiliate feed needs id, retailerName, HTTPS url and at least one supported market");
      }
      definitions.push({
        id:`${retailerId}-${markets.join("-")}`,
        source:`feed-${retailerId}`,
        retailerId,
        retailerName,
        network:String(custom?.network || "Affiliate feed").trim(),
        markets,
        url,
        format:String(custom?.format || "auto").trim().toLowerCase(),
        headersJson:custom?.headers && typeof custom.headers === "object" ? JSON.stringify(custom.headers) : String(custom?.headersJson || "").trim(),
        fieldMapJson:custom?.fieldMap && typeof custom.fieldMap === "object" ? JSON.stringify(custom.fieldMap) : String(custom?.fieldMapJson || "").trim(),
        maxProducts:optionalProductLimit(custom?.maxProducts)
      });
    }
  }
  return [...new Map(definitions.map(definition => [definition.id, definition])).values()];
}

function coverage(enabledProviders = []) {
  return RETAILERS.map(retailer => {
    const configuredMarkets = retailer.markets.filter(market => enabledProviders.some(provider => {
      const id = String(provider.id || provider.source || provider);
      const matchesRetailer = id === retailer.nativeProvider || id.startsWith(`feed-${retailer.id}-`) || id === `feed-${retailer.id}`;
      return matchesRetailer && (!Array.isArray(provider.markets) || provider.markets.includes(market));
    }));
    return {
      id:retailer.id,
      name:retailer.name,
      network:retailer.network,
      markets:[...retailer.markets],
      configuredMarkets,
      configured:configuredMarkets.length > 0,
      fullyConfigured:configuredMarkets.length === retailer.markets.length
    };
  });
}

module.exports = { RETAILERS, coverage, environmentPrefix, feedDefinitions };
