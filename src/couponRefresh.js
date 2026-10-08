const { createEbayClient } = require("./providers/ebay");
const { normalizeCoupons } = require("./coupons");
const { market } = require("./markets");
// Backfill today's selected items when the coupon column is first introduced.
// Run in the background: an upstream outage must not block site startup.
async function backfillDailyCoupons(db, config, client) {
  if (!config.ebayClientId || !config.ebayClientSecret || !config.ebayCampaignId) return 0;
  const rows = db.prepare(`SELECT DISTINCT p.id,p.provider_external_id,p.market
    FROM daily_drops d JOIN products p ON p.id=d.product_id
    WHERE p.source='ebay' AND p.status='published' AND p.coupon_json IS NULL
      AND d.rank <= 3 AND d.drop_date=(SELECT MAX(drop_date) FROM daily_drops WHERE market=d.market)
    LIMIT 15`).all();
  if (!rows.length) return 0;
  const ebay = client || createEbayClient({clientId:config.ebayClientId,clientSecret:config.ebayClientSecret,campaignId:config.ebayCampaignId});
  const update = db.prepare("UPDATE products SET coupon_json=? WHERE id=?");
  let changed = 0;
  for (const row of rows) {
    try {
      const id = String(row.provider_external_id || "").replace(/^ebay:/, "");
      if (!id) continue;
      const item = await ebay.getItem(id, market(row.market));
      update.run(JSON.stringify(normalizeCoupons(item.availableCoupons)),row.id);
      changed++;
    } catch (error) {
      console.warn(`[coupons] Could not check selected item ${row.id}: ${error.message}`);
      if (error.status === 429) break;
    }
  }
  return changed;
}
module.exports = { backfillDailyCoupons };
