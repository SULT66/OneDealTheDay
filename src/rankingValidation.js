const { rankingLayers } = require("./ranker");
const { canonicalCategory } = require("./catalogTaxonomy");
const { capabilityCoverage } = require("./sourceCapabilities");

const DEFAULT_MARKETS = ["us", "ca", "uk", "fr", "de"];
const DEFAULT_MERCHANT_PROFILES = [
  {source:"ebay", retailer_name:"eBay"},
  {source:"feed-validation", retailer_name:"Awin merchant"}
];

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clean = value => String(value || "").trim();
const key = value => clean(value).toLowerCase() || "unknown";
const round = value => Math.round(number(value) * 1000) / 1000;
const average = values => values.length ? round(values.reduce((sum, value) => sum + number(value), 0) / values.length) : null;
const share = (part, total) => total ? round(part / total) : 0;

function groupBy(items, selector) {
  const groups = new Map();
  for (const item of items) {
    const groupKey = selector(item);
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(item);
  }
  return groups;
}

function merchantName(product) {
  return clean(product.retailer_name) || clean(product.source) || "Unknown merchant";
}

function sliceMetrics(products, topIds = new Set()) {
  return {
    products:products.length,
    top_results:products.filter(product => topIds.has(product)).length,
    average_rank:average(products.map(product => product.ranking_score)),
    average_relevance:average(products.map(product => product.relevance_score)),
    average_commerce_quality:average(products.map(product => product.commerce_quality)),
    average_data_confidence:average(products.map(product => product.evidence_confidence)),
    sparse_data_share:share(products.filter(product => number(product.evidence_confidence) < 55).length, products.length)
  };
}

function merchantInvarianceAudit(products, options = {}) {
  const profiles = options.merchantProfiles || DEFAULT_MERCHANT_PROFILES;
  const tolerance = number(options.invarianceTolerance, 0.001);
  const samples = products.slice(0, Math.max(1, number(options.invarianceSamples, 100)));
  const failures = [];
  let maximumDelta = 0;
  for (const product of samples) {
    const results = profiles.map(profile => rankingLayers({...product, ...profile}, {}).final_rank);
    const delta = results.length ? Math.max(...results) - Math.min(...results) : 0;
    maximumDelta = Math.max(maximumDelta, delta);
    if (delta > tolerance) failures.push({
      market:clean(product.market).toLowerCase(),
      category:canonicalCategory(product),
      product:clean(product.title),
      delta:round(delta)
    });
  }
  return {
    passed:failures.length === 0,
    samples:samples.length,
    merchant_profiles:profiles.map(profile => profile.retailer_name),
    tolerance,
    maximum_delta:round(maximumDelta),
    failures:failures.slice(0, 25)
  };
}

function rankingValidationReport(products, options = {}) {
  const rows = (products || []).filter(product => product && clean(product.status || "published") === "published");
  const expectedMarkets = options.expectedMarkets || DEFAULT_MARKETS;
  const topK = Math.max(1, Math.round(number(options.topK, 10)));
  const issues = [];
  const requiredScores = ["relevance_score", "commerce_quality", "ranking_score", "evidence_confidence"];

  for (const product of rows) {
    for (const field of requiredScores) {
      if (product[field] == null || !Number.isFinite(Number(product[field]))) {
        issues.push({severity:"error", code:"missing_ranking_field", market:clean(product.market), product:clean(product.title), field});
      } else if (number(product[field]) < 0 || number(product[field]) > 100) {
        issues.push({severity:"error", code:"ranking_field_out_of_range", market:clean(product.market), product:clean(product.title), field, value:number(product[field])});
      }
    }
  }

  const rowsByMarket = groupBy(rows, product => clean(product.market).toLowerCase());
  for (const market of expectedMarkets) {
    if (!rowsByMarket.get(market)?.length) issues.push({severity:"error", code:"missing_market", market});
  }

  const markets = expectedMarkets.map(market => {
    const marketRows = [...(rowsByMarket.get(market) || [])].sort((left, right) =>
      number(right.ranking_score) - number(left.ranking_score) || clean(left.title).localeCompare(clean(right.title))
    );
    const topRows = marketRows.slice(0, topK);
    const topIds = new Set(topRows);
    const merchantGroups = groupBy(marketRows, merchantName);
    const categoryGroups = groupBy(marketRows, product => canonicalCategory(product));
    const merchants = [...merchantGroups.entries()].map(([merchant, merchantRows]) => ({
      merchant,
      catalog_share:share(merchantRows.length, marketRows.length),
      top_share:share(merchantRows.filter(product => topIds.has(product)).length, topRows.length),
      capability_coverage:capabilityCoverage(merchantRows),
      ...sliceMetrics(merchantRows, topIds)
    })).sort((left, right) => right.products - left.products || left.merchant.localeCompare(right.merchant));
    const categories = [...categoryGroups.entries()].map(([category, categoryRows]) => {
      const categoryMerchants = [...groupBy(categoryRows, merchantName).entries()].map(([merchant, merchantRows]) => ({
        merchant,
        share:share(merchantRows.length, categoryRows.length),
        ...sliceMetrics(merchantRows, topIds)
      })).sort((left, right) => right.products - left.products || left.merchant.localeCompare(right.merchant));
      const largestShare = Math.max(0, ...categoryMerchants.map(merchant => merchant.share));
      if (categoryRows.length >= 5 && categoryMerchants.length >= 2 && largestShare > 0.8) {
        issues.push({severity:"warning", code:"merchant_concentration", market, category, share:largestShare});
      }
      return {
        category,
        ...sliceMetrics(categoryRows, topIds),
        merchant_count:categoryMerchants.length,
        merchants:categoryMerchants
      };
    }).sort((left, right) => right.products - left.products || left.category.localeCompare(right.category));
    const crossMerchantCategories = categories.filter(category => category.merchant_count >= 2).length;
    if (merchantGroups.size >= 2 && crossMerchantCategories === 0) {
      issues.push({severity:"warning", code:"no_cross_merchant_category", market});
    } else if (marketRows.length && merchantGroups.size === 1) {
      issues.push({severity:"coverage", code:"single_merchant_market", market});
    }
    return {
      market,
      ...sliceMetrics(marketRows, topIds),
      merchant_count:merchants.length,
      category_count:categories.length,
      cross_merchant_categories:crossMerchantCategories,
      merchants,
      categories
    };
  });

  const invariance = merchantInvarianceAudit(rows, options);
  if (!invariance.passed) issues.push({severity:"error", code:"merchant_identity_changes_rank", failures:invariance.failures.length, maximum_delta:invariance.maximum_delta});
  const errors = issues.filter(issue => issue.severity === "error");
  const warnings = issues.filter(issue => issue.severity === "warning");
  return {
    model:"ranking-validation-v1",
    generated_at:new Date().toISOString(),
    status:errors.length ? "fail" : warnings.length ? "pass_with_warnings" : "pass",
    policy:{merchant_exposure_quotas:false, concentration_is_diagnostic_only:true},
    totals:{
      products:rows.length,
      markets_with_products:markets.filter(market => market.products > 0).length,
      merchants:new Set(rows.map(merchantName)).size,
      categories:new Set(rows.map(product => key(canonicalCategory(product)))).size,
      complete_ranking_rows:rows.filter(product => requiredScores.every(field => product[field] != null && Number.isFinite(Number(product[field])))).length,
      errors:errors.length,
      warnings:warnings.length,
      coverage_gaps:issues.filter(issue => issue.severity === "coverage").length
    },
    invariance,
    markets,
    issues
  };
}

module.exports = { merchantInvarianceAudit, rankingValidationReport };
