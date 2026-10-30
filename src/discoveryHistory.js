const {priceIntelligence} = require('./priceIntelligence');
// One bounded history read per cached market, never one query per card.
function discoveryHistory(db, rows, market, now = Date.now()) {
  const observations = db.prepare(`SELECT h.product_id,h.price,h.observed_at
    FROM products p JOIN price_history h ON h.product_id=p.id
    WHERE p.market=? AND p.status='published' AND h.observed_at>=? AND h.observed_at<=?
      AND (h.currency=p.currency OR h.currency IS NULL)
    ORDER BY h.product_id,h.observed_at`).all(market,new Date(now-90*86400000).toISOString(),new Date(now).toISOString());
  const byId = new Map();
  for(const row of observations) { if(!byId.has(row.product_id)) byId.set(row.product_id,[]); byId.get(row.product_id).push(row); }
  return rows.map(row=>{
    const history=byId.get(row.id);
    if(!history) return row;
    const stats=priceIntelligence(history,now);
    return {...row, average_30_day_price:stats.day30.sufficient ? stats.day30.average : 0,
      average_90_day_price:stats.day90.sufficient ? stats.day90.average : 0};
  });
}
module.exports={discoveryHistory};
