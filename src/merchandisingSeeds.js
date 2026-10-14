// Public listing evidence selects candidates, never supplies prices or stock.
// Totals belong to the listing (including all styles), not recent sales.
const SEEDS = [
  {legacyId:'323493717418', group:true, query:'Halloween mask', title:'Black Lace Mask Masquerade Eye Face Eyemask Women Party Halloween', sold:1933, snapshot:'today'},
  {legacyId:'366411529710', query:'Halloween mask', title:'Realistic Halloween Latex Human Wrinkle Face Mask Old Man Full Head Headwear US', sold:132, snapshot:'2 weeks ago'},
  {legacyId:'392275804793', query:'Halloween poster', title:'Halloween movie poster print : 11 x 17 : The Night He Came Home', sold:490, snapshot:'last month'},
].map(seed => ({...seed, sourceUrl:`https://www.ebay.com/itm/${seed.legacyId}`,
  retrievedAt:'2026-10-14T04:17:08Z', expiresAt:'2026-10-24T04:00:00Z'}));
function activeSeeds({market, now=Date.now()}={}) {
  return market === 'us' ? SEEDS.filter(s => Date.parse(s.retrievedAt) <= now && now < Date.parse(s.expiresAt)) : [];
}
function listingId(product) {
  const match = String(product.external_id || '').match(/(?:^|:)v1\|(\d{12})\|/);
  if (match) return match[1];
  try {
    const url=new URL(product.affiliate_url);
    if (!/(^|\.)ebay\.(com|co\.uk|ca|de|fr)$/.test(url.hostname)) return null;
    return url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d{12})(?:\/|$)/)?.[1] || null;
  } catch { return null; }
}
function salesEvidence(product, {now=Date.now()}={}) {
  if (product?.source !== 'ebay') return null;
  const candidate=activeSeeds({market:product.market,now}).find(s => s.legacyId === listingId(product));
  // Protect against an edited/reused listing or an unrelated product with its URL.
  const words=value=>String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const seed=candidate && words(product.title) === words(candidate.title) ? candidate : null;
  // A child-variant estimate and the parent listing's all-style total differ
  // in scope. Keep the verified parent total explicitly labeled as such.
  // For single-item listings a fresh API estimate always takes precedence.
  if (!seed?.group && Number.isSafeInteger(product.ebay_sold_quantity) && product.ebay_sold_quantity >= 0)
    return {quantity:product.ebay_sold_quantity, basis:'api_estimate', scope:'item', sourceUrl:null};
  if (!seed) return null;
  return {quantity:seed.sold, basis:'listing_report', scope:'listing_all_variants',
    sourceUrl:seed.sourceUrl, retrievedAt:seed.retrievedAt, snapshot:seed.snapshot};
}
module.exports={activeSeeds, salesEvidence};
