/*
 * The same product, somewhere else.
 *
 * The site says it compares, and it does not. Every price on a product page
 * is the one price the shop that sent us the listing charges, and the only
 * thing beside it is that shop's own "was" figure — the number we stopped
 * printing as ours because it is theirs. Measured on the live catalogue:
 * 1,705 barcodes, and not one product that appears in two of our shops. The
 * catalogues do not overlap, so a comparison can never fall out of them.
 *
 * It has to be gone and fetched. eBay's Browse API searches by barcode, and
 * 1,586 of Newegg's 1,595 listings carry one, so for most of the catalogue
 * there is a question we can ask on the shopper's behalf: what does this exact
 * product cost on the largest marketplace in the country, and what do the
 * people who bought it there say about it?
 *
 * That answers both of the catalogue's gaps at once. The comparison is the
 * thing a deal site is for, and the reviews are the evidence no feed gives us
 * — Newegg sends none, the brand feeds send none, and eBay is the only source
 * on the site that has any.
 *
 * Two rules this module keeps:
 *
 *   1. A match is a barcode match. Not a title that looks similar, not a
 *      model number that starts the same: the barcode is the product's own
 *      identity and it is the only thing here allowed to say two listings are
 *      the same thing. A wrong match is a false price comparison, which is
 *      worse than no comparison at all.
 *   2. What comes back is labelled as eBay's, never as ours. The price is
 *      eBay's price on the day we asked, and the rating belongs to the eBay
 *      listing — see how the product page presents it.
 */

const { createEbayClient, isQuotaError } = require("./providers/ebay");

/* How long a comparison is worth keeping before it is asked again. Prices
   move, and a week-old comparison presented as today's is the same failure as
   a week-old price presented as today's. */
const STALE_AFTER_DAYS = 7;
/* A day's worth of lookups. The catalogue is ~1,700 barcodes and the eBay
   allowance has roughly half of five thousand calls spare, so a few hundred a
   day covers everything inside a week and leaves the refresh untouched. */
const DEFAULT_BATCH = 200;

const text = (value) => String(value == null ? "" : value).trim();
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The product's barcode, or nothing.
 *
 * GTIN, UPC and EAN are the same number written to different lengths, so any
 * of the three will do; anything that is not 8 to 14 digits is not one of
 * them and is not worth a call.
 */
function barcodeOf(product) {
  for (const field of [product?.gtin, product?.upc, product?.ean]) {
    const digits = text(field).replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 14) return digits;
  }
  return "";
}

const listingPrice = (item) => {
  const price = number(item?.price?.value, 0);
  const shipping = number(item?.shippingOptions?.[0]?.shippingCost?.value, 0);
  return price > 0 ? price + Math.max(0, shipping) : 0;
};

/**
 * Which of eBay's answers to keep.
 *
 * The cheapest new, fixed-price listing that can actually be bought. Auctions
 * are not a price anybody can pay today, and a used listing is not the same
 * offer as the new one we are comparing it against.
 */
function pickComparable(items = []) {
  const usable = (Array.isArray(items) ? items : []).filter((item) => {
    const buying = Array.isArray(item?.buyingOptions) ? item.buyingOptions : [];
    const condition = text(item?.condition).toLowerCase();
    return (
      text(item?.itemId) &&
      text(item?.title) &&
      listingPrice(item) > 0 &&
      buying.includes("FIXED_PRICE") &&
      (condition === "" || condition.includes("new"))
    );
  });
  if (!usable.length) return null;
  const best = usable.sort((left, right) => listingPrice(left) - listingPrice(right))[0];
  const review = best?.primaryProductReviewRating || {};
  return {
    item_id: text(best.itemId),
    title: text(best.title).slice(0, 240),
    price: Math.round(listingPrice(best) * 100) / 100,
    currency: text(best?.price?.currency) || "USD",
    url: text(best.itemAffiliateWebUrl || best.itemWebUrl).slice(0, 500),
    rating: number(review.averageRating, 0),
    review_count: Math.round(number(review.reviewCount, 0)),
  };
}

/* ------------------------------------------------------------- storage */

function saveComparable(db, { productId, barcode, match, now = Date.now() }) {
  db.prepare(`
    INSERT INTO product_comparables(
      product_id,barcode,found,source,item_id,title,price,currency,url,rating,review_count,checked_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET
      barcode=excluded.barcode, found=excluded.found, source=excluded.source, item_id=excluded.item_id,
      title=excluded.title, price=excluded.price, currency=excluded.currency, url=excluded.url,
      rating=excluded.rating, review_count=excluded.review_count, checked_at=excluded.checked_at
  `).run(
    productId,
    barcode,
    match ? 1 : 0,
    match ? "ebay" : null,
    match?.item_id || null,
    match?.title || null,
    match?.price ?? null,
    match?.currency || null,
    match?.url || null,
    match?.rating ?? null,
    match?.review_count ?? null,
    new Date(now).toISOString(),
  );
}

function comparableFor(db, productId) {
  const row = db
    .prepare("SELECT * FROM product_comparables WHERE product_id=? AND found=1")
    .get(productId);
  return row || null;
}

/**
 * The products worth asking about next.
 *
 * Never asked first, then longest since asked; a listing whose own source is
 * eBay is skipped, because comparing eBay's price against eBay's price is a
 * call spent to learn nothing.
 */
function productsNeedingComparables(db, { limit = DEFAULT_BATCH, staleAfterDays = STALE_AFTER_DAYS, market, now = Date.now() } = {}) {
  const cutoff = new Date(now - staleAfterDays * 86400000).toISOString();
  return db.prepare(`
    SELECT p.id, p.gtin, p.upc, p.ean, p.current_price, p.market
    FROM products p
    LEFT JOIN product_comparables c ON c.product_id = p.id
    WHERE p.status='published'
      AND LOWER(COALESCE(p.source,'')) <> 'ebay'
      AND (COALESCE(p.gtin,'') <> '' OR COALESCE(p.upc,'') <> '' OR COALESCE(p.ean,'') <> '')
      ${market ? "AND p.market = @market" : ""}
      AND (c.product_id IS NULL OR c.checked_at < @cutoff)
    ORDER BY c.checked_at IS NOT NULL, c.checked_at ASC, p.id ASC
    LIMIT @limit
  `).all({ limit, cutoff, ...(market ? { market } : {}) });
}

/* --------------------------------------------------------- the sweep */

/**
 * One batch of lookups, one call each.
 *
 * Stops the moment eBay says the allowance is gone: the refresh that keeps the
 * catalogue alive spends from the same allowance, and a comparison is worth
 * less than a price that is still current tomorrow.
 */
async function refreshComparables(db, {
  clientId = process.env.EBAY_CLIENT_ID,
  clientSecret = process.env.EBAY_CLIENT_SECRET,
  campaignId = process.env.EBAY_CAMPAIGN_ID,
  environment = process.env.EBAY_ENVIRONMENT,
  fetchImpl = global.fetch,
  client,
  market,
  limit = DEFAULT_BATCH,
  staleAfterDays = STALE_AFTER_DAYS,
  now = Date.now(),
} = {}) {
  const selectedMarket = market || require("./markets").market(require("./config").primaryMarket);
  const due = productsNeedingComparables(db, {
    limit,
    staleAfterDays,
    market: selectedMarket?.code,
    now,
  });
  if (!due.length) return { checked: 0, matched: 0, failed: 0, stopped: null };
  if (!client && !(clientId && clientSecret)) {
    return { checked: 0, matched: 0, failed: 0, stopped: "eBay credentials are not set." };
  }

  const ebay = client || createEbayClient({ clientId, clientSecret, campaignId, environment, fetchImpl });
  let checked = 0;
  let matched = 0;
  let failed = 0;
  let stopped = null;

  for (const product of due) {
    const barcode = barcodeOf(product);
    if (!barcode) continue;
    try {
      const items = await ebay.searchByGtin(barcode, selectedMarket);
      const match = pickComparable(items);
      saveComparable(db, { productId: product.id, barcode, match, now });
      checked += 1;
      if (match) matched += 1;
    } catch (error) {
      if (isQuotaError(error)) {
        stopped = `eBay allowance reached: ${error.message}`;
        break;
      }
      failed += 1;
      /* A listing that cannot be looked up today is recorded as asked, so the
         batch moves on rather than stalling on the same few every night. */
      saveComparable(db, { productId: product.id, barcode, match: null, now });
    }
  }

  return { checked, matched, failed, stopped };
}

module.exports = {
  DEFAULT_BATCH,
  STALE_AFTER_DAYS,
  barcodeOf,
  comparableFor,
  pickComparable,
  productsNeedingComparables,
  refreshComparables,
  saveComparable,
};
