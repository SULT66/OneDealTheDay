const assert = require("assert");
const { scoreOffers } = require("../src/ranker");
const { rankingValidationReport } = require("../src/rankingValidation");

const markets = [["us", "USD"], ["ca", "CAD"], ["uk", "GBP"], ["fr", "EUR"], ["de", "EUR"]];
const merchants = [
  {source:"ebay", retailer_name:"eBay"},
  {source:"feed-validation", retailer_name:"Awin merchant"}
];
const rows = [];
for (const [market, currency] of markets) {
  for (const category of ["Mattresses", "Office gadgets"]) {
    for (const merchant of merchants) {
      const title = category === "Mattresses" ? "Acme Queen Medium Firm Mattress" : "Acme Ergonomic Office Lamp";
      const [scored] = scoreOffers([{
        ...merchant,
        external_id:`${market}-${category}-${merchant.source}`,
        market,
        currency,
        title,
        category,
        description:title,
        image_url:"https://example.com/product.jpg",
        affiliate_url:"https://example.com/buy",
        availability:"In stock",
        current_price:category === "Mattresses" ? 599 : 79,
        original_price:category === "Mattresses" ? 799 : 99,
        rating:4.7,
        review_count:250,
        seller_name:"Verified seller",
        seller_rating:4.9,
        seller_feedback_count:1000,
        shipping_summary:"Free shipping",
        return_summary:"30 day returns",
        status:"published"
      }], {currency, minimumEvidenceConfidence:0});
      rows.push({...scored, status:"published"});
    }
  }
}

const report = rankingValidationReport(rows);
assert.strictEqual(report.model, "ranking-validation-v1");
assert.strictEqual(report.status, "pass");
assert.strictEqual(report.totals.markets_with_products, 5);
assert.strictEqual(report.totals.merchants, 2);
assert.strictEqual(report.totals.complete_ranking_rows, rows.length);
assert.strictEqual(report.invariance.passed, true, "Merchant identity changed the rank of otherwise identical evidence");
assert.strictEqual(report.invariance.maximum_delta, 0);
for (const market of report.markets) {
  assert.strictEqual(market.merchant_count, 2, `${market.market} merchant slice is incomplete`);
  assert.strictEqual(market.cross_merchant_categories, 2, `${market.market} lacks comparable cross-merchant categories`);
}
assert.deepStrictEqual(report.policy, {merchant_exposure_quotas:false, concentration_is_diagnostic_only:true});

const skewed = rankingValidationReport([
  ...rows,
  ...Array.from({length:9}, (_, index) => ({...rows[0], external_id:`skew-${index}`, title:`Skew product ${index}`}))
]);
assert(skewed.issues.some(issue => issue.code === "merchant_concentration"), "Merchant concentration was not reported");
assert.notStrictEqual(skewed.status, "fail", "A diagnostic exposure warning became a merchant quota");

const incomplete = rankingValidationReport(rows.map((product, index) => index ? product : {...product, ranking_score:null}));
assert.strictEqual(incomplete.status, "fail");
assert(incomplete.issues.some(issue => issue.code === "missing_ranking_field" && issue.field === "ranking_score"));

console.log("Day 7 category, merchant, market and source-neutral ranking validation passed.");
