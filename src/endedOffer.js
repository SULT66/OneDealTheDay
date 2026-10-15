/*
 * Finding a listing that has left the catalogue, and what to offer instead.
 *
 * Archiving sets a status; it does not delete the row (src/linkHealth.js and
 * src/refresh.js). Everything else on this table requires status='published',
 * so the page of a departed listing returns 404 — measured against production
 * on 2026-10-15, that is exactly what it serves.
 *
 * Correct for a shop, wrong for us. A pin lives six months to a year and a
 * guide links out for longer, so the end of one of those links is reached long
 * after the offer is over. The visitor came looking for a thing of this kind
 * and we still have those.
 *
 * Kept out of the route so it can be tested against the real schema without
 * booting the server or holding retailer credentials.
 */

/**
 * The archived row, or null.
 *
 * `isPublicSource` is applied in JavaScript rather than through sourceSql(),
 * and that is not a style preference: sourceSql() also rejects anything whose
 * availability reads "unavailable", and archiving a listing is precisely what
 * sets it (src/refresh.js). The row would have filtered itself out.
 */
function endedProduct(db, { id, market, isPublicSource }) {
  const numeric = /^\d+$/.test(String(id || "")) ? String(id) : "";
  if (!numeric || !market) return null;
  const product = db
    .prepare("SELECT * FROM products WHERE id=? AND market=? AND status<>'published'")
    .get(numeric, market);
  if (!product) return null;
  if (typeof isPublicSource === "function" && !isPublicSource(product.source)) return null;
  return product;
}

/**
 * Live listings in the same category, best first.
 *
 * The category rather than the product: somebody who followed a six-month-old
 * pin to a cordless drill wants a cordless drill, not this one. When the
 * archived row carries no category, the strongest current listings stand in —
 * a short list of good things beats an empty page.
 */
function alternativesFor(db, { market, category, sourceSql, limit = 40 }) {
  const normalized = String(category || "").trim();
  return db
    .prepare(`
      SELECT * FROM products
      WHERE market=? AND status='published' AND ${sourceSql}
        AND (? = '' OR normalized_category = ?)
      ORDER BY COALESCE(ranking_score,score) DESC, score DESC
      LIMIT ?
    `)
    .all(market, normalized, normalized, limit);
}

module.exports = { alternativesFor, endedProduct };
