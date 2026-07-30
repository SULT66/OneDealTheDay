const products = [
  ["B0764HS4SL", "Fullstar Vegetable Chopper", "Fullstar", "Kitchen", "A practical prep tool that can turn repetitive chopping into a quick, easy-to-show kitchen shortcut.", 100],
  ["B0C2FF4JD1", "Ninja Blast Portable Blender BC151BK", "Ninja", "Kitchen", "Portable blending has an immediate everyday use case and works especially well in short recipe demonstrations.", 99],
  ["B010TCP3SC", "DASH Mini Waffle Maker", "DASH", "Kitchen", "Compact, approachable and easy to demonstrate with quick breakfasts, snacks and creative mini recipes.", 98],
  ["B0113UZJE2", "Etekcity Digital Kitchen Scale EK6015", "Etekcity", "Kitchen", "A simple kitchen upgrade for portioning, baking and repeatable recipes without taking up much counter space.", 97],
  ["B0C6XK77HJ", "Anker Nano Power Bank USB-C", "Anker", "Tech", "A pocket-size answer to a universal problem: keeping a phone charged while away from an outlet.", 96],
  ["B0B14C719T", "Kasa Smart Plug Mini EP25, 4-Pack", "Kasa", "Smart Home", "Makes ordinary lamps and appliances easier to schedule and control without replacing the devices themselves.", 95],
  ["B07XHLGSXN", "Govee LED Lights", "Govee", "Home", "Lighting creates a visible before-and-after transformation that is easy to understand in a few seconds.", 94],
  ["B0016HF5GK", "BISSELL Little Green Cleaner 1400B", "BISSELL", "Home", "Portable spot cleaning delivers the kind of clear before-and-after result that makes a product useful and memorable.", 93],
  ["B00BAGTNAQ", "ChomChom Pet Hair Remover", "ChomChom", "Pets", "A reusable tool for a familiar pet-owner problem, with results that can be demonstrated instantly on fabric.", 92],
  ["B074PVTPBW", "Mighty Patch Original, 36 Patches", "Hero Cosmetics", "Beauty", "A compact, straightforward beauty product that fits easily into a simple nighttime skincare routine.", 91]
].map(([asin, title, brand, category, selectionReason, score]) => ({
  asin,
  title,
  brand,
  category,
  selectionReason,
  score
}));

function installManualCatalog(db) {
  const now = new Date().toISOString();
  const trackingId = "onedailydrop-20";
  const ids = products.map(product => `us:${product.asin}`);
  const placeholders = ids.map(() => "?").join(",");

  const upsert = db.prepare(`
    INSERT INTO products(
      external_id,provider_external_id,market,product_key,brand,brand_slug,
      title,category,description,image_url,affiliate_url,retailer_name,
      availability,rating,review_count,current_price,original_price,currency,
      score,selection_reason,source,status,updated_at,first_seen_at,last_seen_at
    ) VALUES(
      @external_id,@provider_external_id,'us',@product_key,@brand,@brand_slug,
      @title,@category,@description,'/product-placeholder.svg',@affiliate_url,'Amazon',
      'Confirm on Amazon',NULL,NULL,NULL,NULL,'USD',
      @score,@selection_reason,'amazon-manual','published',@updated_at,@first_seen_at,@last_seen_at
    )
    ON CONFLICT(external_id) DO UPDATE SET
      provider_external_id=excluded.provider_external_id,
      market=excluded.market,
      product_key=excluded.product_key,
      brand=excluded.brand,
      brand_slug=excluded.brand_slug,
      title=excluded.title,
      category=excluded.category,
      description=excluded.description,
      image_url=excluded.image_url,
      affiliate_url=excluded.affiliate_url,
      retailer_name=excluded.retailer_name,
      availability=excluded.availability,
      rating=NULL,
      review_count=NULL,
      current_price=NULL,
      original_price=NULL,
      currency=excluded.currency,
      score=excluded.score,
      selection_reason=excluded.selection_reason,
      source=excluded.source,
      status=excluded.status,
      updated_at=excluded.updated_at,
      last_seen_at=excluded.last_seen_at
  `);

  db.transaction(() => {
    const obsolete = db.prepare(`
      SELECT id FROM products
      WHERE market='us' AND source='amazon-manual' AND external_id NOT IN (${placeholders})
    `).all(...ids).map(row => row.id);
    if (obsolete.length) {
      const obsoletePlaceholders = obsolete.map(() => "?").join(",");
      db.prepare(`DELETE FROM daily_drops WHERE product_id IN (${obsoletePlaceholders})`).run(...obsolete);
      db.prepare(`DELETE FROM price_history WHERE product_id IN (${obsoletePlaceholders})`).run(...obsolete);
      db.prepare(`DELETE FROM clicks WHERE product_id IN (${obsoletePlaceholders})`).run(...obsolete);
      db.prepare(`DELETE FROM products WHERE id IN (${obsoletePlaceholders})`).run(...obsolete);
    }

    for (const product of products) {
      upsert.run({
        external_id: `us:${product.asin}`,
        provider_external_id: product.asin,
        product_key: product.asin,
        brand: product.brand,
        brand_slug: product.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        title: product.title,
        category: product.category,
        description: product.selectionReason,
        affiliate_url: `https://www.amazon.com/dp/${product.asin}?tag=${trackingId}`,
        score: product.score,
        selection_reason: product.selectionReason,
        updated_at: now,
        first_seen_at: now,
        last_seen_at: now
      });
    }
  })();
}

module.exports = { products, installManualCatalog };
