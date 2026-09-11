const { market } = require("./markets");
const { normalizeProductIdentity } = require("./productIdentity");
const { SCORE_MODEL, isDailyPickEligible, scoreOffers, selectUniqueProducts } = require("./ranker");
const { TAXONOMY_VERSION, normalizeCatalogProduct } = require("./catalogTaxonomy");
const { priceIntelligence } = require("./priceIntelligence");

function localDate(timezone, value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:timezone,
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(value);
  const part = type => parts.find(entry => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function needsRecalculation(db) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM products
    WHERE status='published' AND (
      COALESCE(score_breakdown,'') NOT LIKE ?
      OR evidence_confidence IS NULL
      OR commerce_quality IS NULL
      OR ranking_score IS NULL
      OR landed_cost IS NULL
      OR COALESCE(normalized_category,'')=''
      OR COALESCE(taxonomy_version,'')<>?
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%does%apply%'
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%not%applicable%'
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%nicht%zutreffend%'
    )
    LIMIT 1
  `).get(`%"model":"${SCORE_MODEL}"%`, TAXONOMY_VERSION));
}

function recalculateCatalog(db, marketCodes = ["us", "ca", "uk", "fr", "de"], options = {}) {
  if (!options.force && !needsRecalculation(db)) return { changed:false, products:0, selections:0, markets:[] };

  const rows = db.prepare("SELECT * FROM products").all();

  /*
   * The price history, read back before anything is scored.
   *
   * A refresh attaches thirty- and ninety-day averages to each product before
   * scoring it, and nothing writes them to the row — there are no columns for
   * them. So a recalculation, which starts from the rows, scored every listing
   * as though its price had never been observed before. That is worth
   * twenty-five points of evidence confidence, and it moved the published
   * number: a pair of earbuds stored at 100 confidence and 86 came back at 75
   * and 84, purely because the recalculation did not look at observations the
   * database was holding the whole time.
   *
   * Lowering a score for evidence we have and did not read is not caution, it
   * is a wrong answer. Same history, same function, same shape as the refresh
   * uses, so the two paths agree by construction rather than by coincidence.
   */
  const historyRows = db.prepare(`
    SELECT product_id, price, observed_at
    FROM price_history
    WHERE observed_at>=?
    ORDER BY observed_at ASC
  `).all(new Date(Date.now() - 90 * 86400000).toISOString());
  const historyByProduct = new Map();
  for (const row of historyRows) {
    if (!historyByProduct.has(row.product_id)) historyByProduct.set(row.product_id, []);
    historyByProduct.get(row.product_id).push(row);
  }
  const withPriceHistory = row => {
    const observed = historyByProduct.get(row.id);
    if (!observed?.length) return row;
    const intelligence = priceIntelligence(observed);
    if (!intelligence.observations.length) return row;
    return {
      ...row,
      price_history_observation_count:intelligence.observations.length,
      price_history_distinct_days:intelligence.day90.distinctDays,
      price_history_coverage_days:intelligence.day90.coverageDays,
      average_30_day_price:intelligence.day30.sufficient ? intelligence.day30.average : 0,
      lowest_30_day_price:intelligence.day30.sufficient ? intelligence.day30.low : 0,
      average_90_day_price:intelligence.day90.sufficient ? intelligence.day90.average : 0,
      lowest_90_day_price:intelligence.day90.sufficient ? intelligence.day90.low : 0
    };
  };

  const scoredById = new Map();
  const normalizedById = new Map();
  const selectedByMarket = new Map();
  const selectionMarkets = Array.isArray(options.selectionMarkets) ? options.selectionMarkets : marketCodes;

  for (const row of rows) normalizedById.set(row.id, normalizeProductIdentity(normalizeCatalogProduct(withPriceHistory(row))));
  for (const code of marketCodes) {
    const candidates = rows.filter(row => row.market === code).map(row => normalizedById.get(row.id));
    const scored = scoreOffers(candidates, {
      currency:market(code).currency,
      minimumScore:0,
      minimumEvidenceConfidence:0,
      minimumRating:0,
      minimumReviews:0,
      maximumShippingRatio:0.5
    });
    for (const product of scored) scoredById.set(product.id, product);
    selectedByMarket.set(code, selectUniqueProducts(scored).filter(isDailyPickEligible).slice(0, 10));
  }

  let selectionCount = 0;
  db.transaction(() => {
    const updateProduct = db.prepare(`
      UPDATE products
      SET product_key=?,gtin=?,upc=?,ean=?,shipping_cost=?,landed_cost=?,score=?,relevance_score=?,
          commerce_quality=?,ranking_score=?,evidence_confidence=?,normalized_category=?,taxonomy_version=?,
          score_breakdown=?,selection_reason=?,status=?,updated_at=?
      WHERE id=?
    `);
    const now = new Date().toISOString();
    for (const row of rows) {
      const normalized = normalizedById.get(row.id);
      const scored = scoredById.get(row.id);
      const publicStatus = scored ? "published" : "archived";
      updateProduct.run(
        normalized.product_key,
        normalized.gtin,
        normalized.upc,
        normalized.ean,
        scored?.shipping_cost ?? null,
        scored?.landed_cost ?? null,
        scored?.score ?? 0,
        scored?.relevance_score ?? 0,
        scored?.commerce_quality ?? 0,
        scored?.ranking_score ?? 0,
        scored?.evidence_confidence ?? 0,
        normalized.normalized_category,
        normalized.taxonomy_version,
        JSON.stringify(scored?.score_breakdown || {model:SCORE_MODEL}),
        scored?.selection_reason || "",
        publicStatus,
        now,
        row.id
      );
    }

    const insertDrop = db.prepare(`
      INSERT INTO daily_drops(
        market,drop_date,product_id,rank,score,score_model,current_price,original_price,currency,
        selection_reason,availability_status,selected_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    for (const code of selectionMarkets) {
      const selected = selectedByMarket.get(code) || [];
      const dropDate = localDate(market(code).timezone);
      db.prepare("DELETE FROM daily_drops WHERE market=? AND drop_date=?").run(code, dropDate);
      selected.forEach((product, index) => insertDrop.run(
        code,
        dropDate,
        product.id,
        index + 1,
        product.score,
        SCORE_MODEL,
        product.current_price,
        product.original_price,
        product.currency,
        product.selection_reason,
        "Available",
        now
      ));
      selectionCount += selected.length;
    }
  })();

  return {
    changed:true,
    products:rows.length,
    selections:selectionCount,
    markets:marketCodes.map(code => ({code, selected:(selectedByMarket.get(code) || []).length}))
  };
}

module.exports = { localDate, needsRecalculation, recalculateCatalog };
