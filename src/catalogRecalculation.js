const { market } = require("./markets");
const { normalizeProductIdentity } = require("./productIdentity");
const { SCORE_MODEL, scoreOffers, selectUniqueProducts } = require("./ranker");

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
      OR landed_cost IS NULL
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%does%apply%'
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%not%applicable%'
      OR LOWER(COALESCE(product_key,'')) LIKE 'gtin:%nicht%zutreffend%'
    )
    LIMIT 1
  `).get(`%"model":"${SCORE_MODEL}"%`));
}

function recalculateCatalog(db, marketCodes = ["us", "ca", "uk", "fr", "de"], options = {}) {
  if (!options.force && !needsRecalculation(db)) return { changed:false, products:0, selections:0, markets:[] };

  const rows = db.prepare("SELECT * FROM products").all();
  const scoredById = new Map();
  const normalizedById = new Map();
  const selectedByMarket = new Map();
  const selectionMarkets = Array.isArray(options.selectionMarkets) ? options.selectionMarkets : marketCodes;

  for (const row of rows) normalizedById.set(row.id, normalizeProductIdentity(row));
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
    selectedByMarket.set(code, selectUniqueProducts(scored).filter(product =>
      Number(product.score) >= 60 && Number(product.evidence_confidence) >= 45
    ).slice(0, 10));
  }

  let selectionCount = 0;
  db.transaction(() => {
    const updateProduct = db.prepare(`
      UPDATE products
      SET product_key=?,gtin=?,upc=?,ean=?,shipping_cost=?,landed_cost=?,score=?,evidence_confidence=?,
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
        scored?.evidence_confidence ?? 0,
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
