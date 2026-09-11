/*
 * How many are actually left, asked of the shop rather than of anybody's word.
 *
 * The Live Drop page showed "12 left" and counted down from a number typed
 * into the admin form. Nothing decremented it, because the sale happens on
 * eBay's checkout and the affiliate report arrives hours later — so during a
 * ten minute drop the counter was a claim about scarcity that nothing could
 * support. On a site whose whole argument is that its numbers mean something,
 * that was the one place it would have been lying to the buyer, and a false
 * scarcity claim is a regulator's problem in the US and the EU besides.
 *
 * The way out is not to trust a partner to say "five left" down the phone —
 * they have every reason to say it whether it is true or not. It is to ask the
 * marketplace, which has no stake in our drop. eBay's Browse API returns an
 * availability block on every listing, and for many sellers that block carries
 * real numbers: how many are available and how many have sold.
 *
 * "For many" is the catch, and it is why this module reports what it found
 * rather than a number it made up. eBay tells us one of three things:
 *
 *   - an exact count       ("3 available")        → a real counter is possible
 *   - a threshold only     ("more than 10")       → honest, but not a countdown
 *   - nothing but a status ("in stock")           → no counter at all
 *
 * Which one you get is the seller's setting, not ours. So a drop can only
 * promise a live count when its own listing answers with the first, and the
 * admin probe exists so that is known before the drop is scheduled rather than
 * discovered while two hundred people are watching.
 */

const { createEbayClient } = require("./providers/ebay");

/* eBay's own words for "we are not telling you the number". */
const THRESHOLD_TYPES = new Set(["MORE_THAN", "LIMITED_QUANTITY"]);

const wholeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

/**
 * The eBay item id inside a link we already hold.
 *
 * Taken from the drop's own buy link rather than stored separately, because a
 * second field is a second thing that can disagree with the first — and the
 * link is the one that decides where the buyer actually lands.
 */
function ebayItemIdFrom(url) {
  const text = String(url || "");
  /* Modern and legacy listing URLs, and the v1| form the Browse API returns. */
  const direct = text.match(/\bv1\|(\d{6,})\|\d*/);
  if (direct) return `v1|${direct[1]}|0`;
  const legacy = text.match(/\/itm\/(?:[^/?#]*\/)?(\d{9,})/);
  if (legacy) return legacy[1];
  const query = text.match(/[?&]item=(\d{9,})/);
  return query ? query[1] : null;
}

/**
 * What eBay says about a listing's stock right now.
 *
 * Returns `{available, sold, status, threshold, exact}`. `available` is null
 * whenever eBay declined to give a number — never zero, because zero is a
 * statement that it has sold out and "we were not told" is not that.
 */
async function readEbayStock(itemId, {
  clientId = process.env.EBAY_CLIENT_ID,
  clientSecret = process.env.EBAY_CLIENT_SECRET,
  campaignId = process.env.EBAY_CAMPAIGN_ID,
  environment = process.env.EBAY_ENVIRONMENT,
  /* eBay needs a marketplace on every call. A drop belongs to one market and
     passes its own; the default is the primary one rather than a guess. */
  market = require("./markets").market(require("./config").primaryMarket),
  fetchImpl = global.fetch,
  client,
} = {}) {
  if (!itemId) throw new Error("No eBay item id.");
  if (!client && !(clientId && clientSecret)) throw new Error("eBay credentials are not set.");

  const ebay = client || createEbayClient({ clientId, clientSecret, campaignId, environment, fetchImpl });
  /* The legacy numeric id needs the by-legacy-id route; the v1| form does not. */
  const item = /^\d+$/.test(String(itemId))
    ? await ebay.getItemByLegacyId(String(itemId), market)
    : await ebay.getItem(String(itemId), market);

  const availability = item?.estimatedAvailabilities?.[0] || {};
  const status = String(availability.estimatedAvailabilityStatus || "").toUpperCase();
  const thresholdType = String(availability.estimatedAvailabilityThresholdType || "").toUpperCase();

  const available = wholeNumber(availability.estimatedAvailableQuantity);
  const sold = wholeNumber(availability.estimatedSoldQuantity);
  const threshold = wholeNumber(availability.estimatedAvailabilityThreshold);

  return {
    itemId: String(itemId),
    title: item?.title || "",
    status,
    /* True only when eBay gave a count we can count down. Everything on top of
       this — the public counter, closing the drop by itself — is gated on it,
       so a listing that only says "more than 10" can never produce a number
       the page presents as exact. */
    exact: available !== null && !THRESHOLD_TYPES.has(thresholdType),
    available,
    sold,
    threshold: THRESHOLD_TYPES.has(thresholdType) ? threshold : null,
    thresholdType: thresholdType || null,
    outOfStock: status.includes("OUT_OF_STOCK") || status.includes("UNAVAILABLE") || available === 0,
  };
}

/**
 * Refresh one drop's remaining count from the shop, and close it when the shop
 * says there is nothing left.
 *
 * Returns what it did, so the caller can log it and so the tests can assert on
 * it. Does nothing at all — deliberately — when the listing does not give an
 * exact count: a drop whose stock cannot be known keeps whatever the admin set
 * by hand, and the page simply does not claim a number.
 */
async function refreshDropStock(drop, { db, readStock = readEbayStock, market, now = Date.now() } = {}) {
  const itemId = ebayItemIdFrom(drop?.affiliate_url);
  if (!itemId) return { changed: false, reason: "not an eBay listing" };

  let stock;
  try {
    stock = await readStock(itemId, { market });
  } catch (error) {
    /* eBay being unreachable is not evidence that the item sold out. Leaving
       the drop exactly as it was is the only safe failure: closing it would
       end a live event on a network error, and zeroing the counter would tell
       every watcher it had gone when it had not. */
    return { changed: false, reason: `could not ask eBay: ${error.message}` };
  }

  /* Stamped on any answer at all, including an unhelpful one. Without it a
     drop nobody had asked about and a drop whose seller publishes no quantity
     looked identical, and the console reported the second while the truth was
     the first. */
  db.prepare("UPDATE live_drops SET stock_checked_at=? WHERE id=?")
    .run(new Date(now).toISOString(), drop.id);

  if (!stock.exact && !stock.outOfStock) return { changed: false, reason: "eBay gives no exact count", stock };

  /* Never above what this drop was allocated: the shop may have five hundred,
     but the offer is for twenty and saying otherwise oversells it. */
  const remaining = stock.outOfStock
    ? 0
    : Math.min(Math.max(0, stock.available), Math.max(0, Number(drop.quantity_total) || 0) || stock.available);

  /* Stamped even when the count has not moved, because what it records is that
     the shop answered at all — and that is what lets the page show a number
     instead of hiding it. */
  const verifiedAt = new Date(now).toISOString();
  if (remaining === Number(drop.quantity_remaining)) {
    db.prepare("UPDATE live_drops SET stock_verified_at=? WHERE id=?").run(verifiedAt, drop.id);
    return { changed: false, reason: "unchanged", stock, remaining, verifiedAt };
  }

  db.prepare("UPDATE live_drops SET quantity_remaining=?, stock_verified_at=?, updated_at=? WHERE id=?")
    .run(remaining, verifiedAt, verifiedAt, drop.id);

  return { changed: true, remaining, soldOut: remaining === 0, stock, verifiedAt };
}

module.exports = { readEbayStock, refreshDropStock, ebayItemIdFrom };
