const db = require("./db");
const { rankProducts } = require("./ranker");
const { detectBrand, normalizeBrand, slugifyBrand } = require("./brandDetector");
const { priceIntelligence, shouldRecordObservation } = require("./priceIntelligence");

function textValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (["number", "bigint", "boolean"].includes(typeof value)) return String(value);
  if (Buffer.isBuffer(value)) return value.toString();
  if (typeof value === "object") return String(value.text ?? value.name ?? value.title ?? value.label ?? value.code ?? value.value ?? value.url ?? value.link ?? "");
  return String(value);
}

function numberValue(value, fallback = 0) {
  if (value == null) return fallback;
  if (typeof value === "object") value = value.value ?? value.price ?? value.amount ?? value.rating ?? value.count ?? null;
  if (value == null) return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function localDate(timezone, value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const part = type => parts.find(entry => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function daysAgoDate(timezone, days) {
  return localDate(timezone, new Date(Date.now() - days * 86400000));
}

function availabilityStatus(product) {
  const value = String(product.availability || "").toLowerCase();
  if (/out of stock|sold out/.test(value)) return "Out of Stock";
  if (/unavailable|expired|discontinued/.test(value)) return "Deal Expired";
  return "Available";
}

async function loadProducts(config, selectedMarket) {
  if (config.provider === "demo") {
    const provider = require("./providers/demo");
    return provider.searchProducts({ market: selectedMarket });
  }

  const jobs = [];
  const amazonEnabled = ["rainforest", "multi"].includes(config.provider);
  const walmartEnabled = ["walmart", "multi"].includes(config.provider) && selectedMarket.supportsWalmart;
  const ebayEnabled = ["ebay", "multi"].includes(config.provider);

  if (ebayEnabled) {
    if (!config.ebayClientId || !config.ebayClientSecret) throw new Error("eBay Production credentials are missing; existing products were kept");
    if (!/^\d{10}$/.test(config.ebayCampaignId)) throw new Error("EBAY_CAMPAIGN_ID is invalid; existing products were kept");
    const ebay = require("./providers/ebay");
    jobs.push({
      name: `eBay ${selectedMarket.name}`,
      promise: ebay.searchProducts({
        clientId: config.ebayClientId,
        clientSecret: config.ebayClientSecret,
        campaignId: config.ebayCampaignId,
        environment: config.ebayEnvironment,
        keywords: selectedMarket.searchKeywords,
        market: selectedMarket
      })
    });
  }

  if (amazonEnabled) {
    if (!config.rainforestApiKey) throw new Error("RAINFOREST_API_KEY is missing; existing products were kept");
    if (!selectedMarket.affiliateTag) throw new Error(`AFFILIATE_TAG_${selectedMarket.code.toUpperCase()} is missing; ${selectedMarket.name} products were kept`);
    const amazon = require("./providers/rainforest");
    jobs.push({
      name: `Amazon ${selectedMarket.name}`,
      promise: amazon.searchProducts({
        apiKey: config.rainforestApiKey,
        affiliateTag: selectedMarket.affiliateTag,
        keywords: selectedMarket.searchKeywords,
        market: selectedMarket
      })
    });
  }

  if (walmartEnabled) {
    if (!config.bluecartApiKey) throw new Error("BLUECART_API_KEY is missing; existing products were kept");
    const walmart = require("./providers/walmart");
    jobs.push({
      name: `Walmart ${selectedMarket.name}`,
      promise: walmart.searchProducts({
        apiKey: config.bluecartApiKey,
        keywords: selectedMarket.searchKeywords,
        market: selectedMarket
      })
    });
  }

  if (!jobs.length) throw new Error(`No live retailer feed is configured for ${selectedMarket.name}`);
  const results = await Promise.allSettled(jobs.map(job => job.promise));
  const products = [];
  const failures = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") products.push(...result.value);
    else failures.push(`${jobs[index].name}: ${result.reason?.message || "refresh failed"}`);
  });
  if (!products.length) throw new Error(`All ${selectedMarket.name} retailer feeds failed. ${failures.join(" | ")}`);
  if (failures.length) console.error(`Partial ${selectedMarket.name} refresh: ${failures.join(" | ")}`);
  return products;
}

function addPriceIntelligence(products, marketCode) {
  const existingProduct = db.prepare("SELECT id FROM products WHERE market=? AND provider_external_id=?");
  const history = db.prepare(`
    SELECT price, observed_at
    FROM price_history
    WHERE product_id=? AND observed_at>=?
    ORDER BY observed_at ASC
  `);
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  return products.map(product => {
    const existing = existingProduct.get(marketCode, textValue(product.external_id));
    if (!existing) return product;
    const intelligence = priceIntelligence(history.all(existing.id, cutoff));
    const observations = intelligence.observations;
    if (!observations.length) return product;
    return {
      ...product,
      price_history_observation_count: observations.length,
      price_history_distinct_days: intelligence.day90.distinctDays,
      price_history_coverage_days: intelligence.day90.coverageDays,
      average_30_day_price: intelligence.day30.sufficient ? intelligence.day30.average : 0,
      lowest_30_day_price: intelligence.day30.sufficient ? intelligence.day30.low : 0,
      average_90_day_price: intelligence.day90.sufficient ? intelligence.day90.average : 0,
      lowest_90_day_price: intelligence.day90.sufficient ? intelligence.day90.low : 0
    };
  });
}

function selectDailyProducts(ranked, marketCode, timezone, preserveDailySelection) {
  const today = localDate(timezone);
  const productKey = product => textValue(product.external_id);
  if (preserveDailySelection) {
    const current = db.prepare(`
      SELECT p.provider_external_id
      FROM daily_drops d
      JOIN products p ON p.id=d.product_id
      WHERE d.market=? AND d.drop_date=?
      ORDER BY d.rank
    `).all(marketCode, today).map(row => row.provider_external_id);
    const byProviderId = new Map(ranked.map(product => [productKey(product), product]));
    const kept = current.map(id => byProviderId.get(id)).filter(Boolean);
    const used = new Set(kept.map(productKey));
    return [...kept, ...ranked.filter(product => !used.has(productKey(product)))].slice(0, 10);
  }

  const recent = new Set(db.prepare(`
    SELECT p.provider_external_id
    FROM daily_drops d
    JOIN products p ON p.id=d.product_id
    WHERE d.market=? AND d.drop_date>=? AND d.drop_date<?
  `).all(marketCode, daysAgoDate(timezone, 7), today).map(row => row.provider_external_id));
  const fresh = ranked.filter(product => !recent.has(productKey(product)));
  const fallback = ranked.filter(product => recent.has(productKey(product)));
  return [...fresh, ...fallback].slice(0, 10);
}

async function refreshMarket(config, marketCode, options = {}) {
  const selectedMarket = {
    ...config.marketConfig(marketCode),
    searchKeywords: config.marketConfig(marketCode).searchKeywords
  };
  const started = new Date().toISOString();
  const runId = Number(db.prepare(
    "INSERT INTO refresh_runs(provider,market,started_at,status,message) VALUES(?,?,?,'running','')"
  ).run(config.provider, selectedMarket.code, started).lastInsertRowid);

  try {
    const found = addPriceIntelligence(await loadProducts(config, selectedMarket), selectedMarket.code);
    const ranked = rankProducts(found, 60, {
      currency: selectedMarket.currency,
      minimumRating: config.provider === "ebay" ? 0 : 3.8,
      minimumReviews: config.provider === "ebay" ? 0 : 25,
      minimumScore: config.provider === "demo" ? 0 : config.provider === "ebay" ? 28 : 60
    });
    if (!Array.isArray(found) || found.length < 10 || ranked.length < 10) {
      throw new Error(`${selectedMarket.name} refresh returned insufficient eligible products (${found.length} found, ${ranked.length}/10 eligible)`);
    }
    const selected = selectDailyProducts(ranked, selectedMarket.code, selectedMarket.timezone, Boolean(options.preserveDailySelection));
    const updatedAt = new Date().toISOString();
    const dropDate = localDate(selectedMarket.timezone);
    const existingSnapshots = options.preserveDailySelection
      ? new Map(db.prepare(
        "SELECT * FROM daily_drops WHERE market=? AND drop_date=?"
      ).all(selectedMarket.code, dropDate).map(row => [row.product_id, row]))
      : new Map();

    db.transaction(() => {
      const existing = db.prepare("SELECT id,current_price,currency FROM products WHERE external_id=?");
      const productByExternalId = db.prepare("SELECT id,current_price,original_price,currency,source FROM products WHERE external_id=?");
      const latestHistory = db.prepare("SELECT price,currency,observed_at FROM price_history WHERE product_id=? ORDER BY observed_at DESC LIMIT 1");
      const insertHistory = db.prepare("INSERT INTO price_history(product_id,price,original_price,currency,source,observed_at) VALUES(?,?,?,?,?,?)");
      const upsertProduct = db.prepare(`
        INSERT INTO products(
          external_id,provider_external_id,market,product_key,upc,gtin,model_number,brand,brand_slug,manufacturer,mpn,ean,
          title,category,description,image_url,affiliate_url,retailer_name,seller_name,shipping_summary,return_summary,
          availability,checked_at,rating,review_count,current_price,original_price,currency,badge,score,score_breakdown,
          selection_reason,source,status,updated_at,first_seen_at,last_seen_at
        )
        VALUES(
          @external_id,@provider_external_id,@market,@product_key,@upc,@gtin,@model_number,@brand,@brand_slug,@manufacturer,@mpn,@ean,
          @title,@category,@description,@image_url,@affiliate_url,@retailer_name,@seller_name,@shipping_summary,@return_summary,
          @availability,@checked_at,@rating,@review_count,@current_price,@original_price,@currency,@badge,@score,@score_breakdown,
          @selection_reason,@source,'published',@updated_at,@first_seen_at,@last_seen_at
        )
        ON CONFLICT(external_id) DO UPDATE SET
          provider_external_id=excluded.provider_external_id,market=excluded.market,product_key=excluded.product_key,
          upc=excluded.upc,gtin=excluded.gtin,model_number=excluded.model_number,brand=excluded.brand,
          brand_slug=excluded.brand_slug,manufacturer=excluded.manufacturer,mpn=excluded.mpn,ean=excluded.ean,
          title=excluded.title,category=excluded.category,description=excluded.description,image_url=excluded.image_url,
          affiliate_url=excluded.affiliate_url,retailer_name=excluded.retailer_name,seller_name=excluded.seller_name,
          shipping_summary=excluded.shipping_summary,return_summary=excluded.return_summary,
          availability=excluded.availability,checked_at=excluded.checked_at,rating=excluded.rating,
          review_count=excluded.review_count,current_price=excluded.current_price,original_price=excluded.original_price,
          currency=excluded.currency,badge=excluded.badge,score=excluded.score,score_breakdown=excluded.score_breakdown,
          selection_reason=excluded.selection_reason,source=excluded.source,status='published',
          updated_at=excluded.updated_at,last_seen_at=excluded.last_seen_at
      `);

      const idsByProviderExternalId = new Map();
      for (const product of ranked) {
        const providerExternalId = textValue(product.external_id);
        const externalId = `${selectedMarket.code}:${providerExternalId}`;
        const brand = normalizeBrand(detectBrand(product));
        const safe = {
          external_id: externalId,
          provider_external_id: providerExternalId,
          market: selectedMarket.code,
          product_key: textValue(product.product_key),
          upc: textValue(product.upc),
          gtin: textValue(product.gtin),
          model_number: textValue(product.model_number || product.model),
          brand,
          brand_slug: slugifyBrand(brand),
          manufacturer: textValue(product.manufacturer),
          mpn: textValue(product.mpn || product.part_number),
          ean: textValue(product.ean),
          title: textValue(product.title),
          category: textValue(product.category),
          description: textValue(product.description),
          image_url: textValue(product.image_url),
          affiliate_url: textValue(product.affiliate_url),
          retailer_name: textValue(product.retailer_name),
          seller_name: textValue(product.seller_name),
          shipping_summary: textValue(product.shipping_summary),
          return_summary: textValue(product.return_summary),
          availability: textValue(product.availability || "Available"),
          checked_at: textValue(product.checked_at || updatedAt),
          rating: numberValue(product.rating, 0),
          review_count: Math.round(numberValue(product.review_count, 0)),
          current_price: product.current_price == null ? null : numberValue(product.current_price, null),
          original_price: product.original_price == null ? null : numberValue(product.original_price, null),
          currency: textValue(product.currency || selectedMarket.currency).toUpperCase(),
          badge: textValue(product.badge),
          score: numberValue(product.score, 0),
          score_breakdown: JSON.stringify(product.score_breakdown || {}),
          selection_reason: textValue(product.selection_reason),
          source: textValue(product.source),
          updated_at: updatedAt,
          first_seen_at: updatedAt,
          last_seen_at: updatedAt
        };
        const before = existing.get(safe.external_id);
        upsertProduct.run(safe);
        const after = productByExternalId.get(safe.external_id);
        idsByProviderExternalId.set(providerExternalId, after.id);
        const validPrice = Number.isFinite(Number(after?.current_price)) && Number(after.current_price) > 0;
        const previousObservation = after ? latestHistory.get(after.id) : null;
        if (after && validPrice && shouldRecordObservation(previousObservation, after.current_price, after.currency || selectedMarket.currency, updatedAt)) {
          insertHistory.run(after.id, after.current_price, after.original_price, after.currency || selectedMarket.currency, after.source || "", updatedAt);
        }
      }

      const upsertDrop = db.prepare(`
        INSERT INTO daily_drops(
          market,drop_date,product_id,rank,score,current_price,original_price,currency,
          selection_reason,availability_status,selected_at
        )
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(market,drop_date,rank) DO UPDATE SET
          product_id=excluded.product_id,score=excluded.score,current_price=excluded.current_price,
          original_price=excluded.original_price,currency=excluded.currency,
          selection_reason=excluded.selection_reason,availability_status=excluded.availability_status,
          selected_at=excluded.selected_at
      `);
      db.prepare("DELETE FROM daily_drops WHERE market=? AND drop_date=?").run(selectedMarket.code, dropDate);
      selected.forEach((product, index) => {
        const productId = idsByProviderExternalId.get(textValue(product.external_id));
        const snapshot = existingSnapshots.get(productId);
        upsertDrop.run(
          selectedMarket.code,
          dropDate,
          productId,
          index + 1,
          snapshot ? snapshot.score : numberValue(product.score, 0),
          snapshot ? snapshot.current_price : product.current_price == null ? null : numberValue(product.current_price, null),
          snapshot ? snapshot.original_price : product.original_price == null ? null : numberValue(product.original_price, null),
          snapshot ? snapshot.currency : textValue(product.currency || selectedMarket.currency).toUpperCase(),
          snapshot ? snapshot.selection_reason : textValue(product.selection_reason),
          availabilityStatus(product),
          snapshot ? snapshot.selected_at : updatedAt
        );
      });
    })();

    db.prepare(`
      UPDATE refresh_runs
      SET finished_at=?,found_count=?,published_count=?,status='success',message=?
      WHERE id=?
    `).run(
      new Date().toISOString(),
      found.length,
      ranked.length,
      `${selectedMarket.name}: products scored and daily selection saved`,
      runId
    );
    return {
      market: selectedMarket.code,
      provider: config.provider,
      found: found.length,
      eligible: ranked.length,
      selected: selected.length,
      dropDate
    };
  } catch (error) {
    db.prepare("UPDATE refresh_runs SET finished_at=?,status='failed',message=? WHERE id=?")
      .run(new Date().toISOString(), error.message, runId);
    throw error;
  }
}

exports.refreshMarket = refreshMarket;
exports.refreshProducts = async (config, options = {}) => {
  if (typeof options === "string") options = { market: options };
  const markets = options.market ? [options.market] : config.markets;
  const results = [];
  const failures = [];
  for (const marketCode of markets) {
    try {
      results.push(await refreshMarket(config, marketCode, options));
    } catch (error) {
      failures.push({ market: marketCode, error: error.message });
      console.error(`${marketCode.toUpperCase()} catalog refresh failed: ${error.message}`);
    }
  }
  if (!results.length) throw new Error(failures.map(item => `${item.market}: ${item.error}`).join(" | "));
  return { results, failures };
};

exports.localDate = localDate;
