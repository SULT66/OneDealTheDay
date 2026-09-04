/*
 * A link to a shop's front door that still pays.
 *
 * "Shop all at Tribesigns" has been on every product page for months, and
 * until now it earned nothing. It pointed at `retailer_shop_url`, which for an
 * affiliate feed is the merchant's own URL — tribesigns.com/products/… with no
 * network in front of it. A visitor who followed it and filled a basket bought
 * as an ordinary stranger off the open web: no click recorded at Awin, no
 * cookie, no commission. On eBay and Newegg the field is empty, so the link was
 * not offered at all.
 *
 * What a store link is for is exactly the case the product link cannot cover:
 * somebody who likes the shop but wants a different size, a different colour,
 * or something else entirely. Every network pays on that — Awin and Rakuten
 * credit the basket for the length of the advertiser's cookie, eBay for
 * twenty-four hours — but only if the visitor arrived through the network.
 *
 * So the link is built from the product's own affiliate link, which is known to
 * work, by swapping the destination for the shop's front door and leaving every
 * tracking parameter exactly as it was. Nothing here invents a publisher id, a
 * merchant id or a link format: if a link cannot be derived from one that
 * already works, this returns null and the caller shows no link, which is the
 * safe failure. A guessed link is worse than none — it looks like it works,
 * sends real buyers, and pays nobody.
 */

/*
 * Where a redirector keeps the address it will send the visitor to. Awin calls
 * it `ued`, Rakuten `murl`; the rest are the spellings seen often enough
 * elsewhere to be worth recognising.
 */
const DESTINATION_PARAMS = ["ued", "murl", "url", "u"];

/*
 * Paths that belong to a redirect script rather than to a shop. A link whose
 * path looks like this is a tracker we have not taught this file about, and the
 * direct rule at the bottom must not touch it — stripping the path off a
 * tracker produces the tracker's own homepage, which is a link that appears to
 * work and sends the buyer nowhere.
 */
const REDIRECTOR_PATH = /(?:\.php$|^\/(?:link|click|deeplink|redirect|go|c|fs-bin)(?:\/|$))/i;

/*
 * The parameter that identifies us to a shop we link to directly. eBay's
 * `campid` and Amazon's `tag` are the two that matter here.
 *
 * The direct rule at the bottom requires one of these, and that requirement is
 * the whole point of the list. A feed is allowed to give a plain merchant URL
 * as its "affiliate" link — several of the aliases we accept are exactly that —
 * and cutting the path off one of those produces a shop homepage that pays
 * nothing while looking indistinguishable from one that does. Seeing the
 * campaign in the address is what separates the two.
 */
const DIRECT_CAMPAIGN_PARAMS = ["campid", "tag", "ascsubtag", "affid", "aff_id", "publisher_id"];

/*
 * What the network calls the label a publisher may attach to a click, so these
 * clicks can be told apart from product clicks in the network's own reporting.
 * Without it a store link is invisible: the commission arrives in the same
 * column as everything else and there is no way to learn whether the link is
 * worth its place on the page.
 */
const CLICK_REF = "odd-store";

function parseUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    return null;
  }
  return /^https?:$/.test(url.protocol) ? url : null;
}

/* The shop's front door: its own address with everything after the host cut
   off. Taken from the merchant URL the feed supplies, or from the destination
   the affiliate link was already carrying. */
function merchantHome(product, link) {
  const fromFeed = parseUrl(product?.retailer_shop_url);
  if (fromFeed) return `${fromFeed.origin}/`;
  for (const name of DESTINATION_PARAMS) {
    const carried = parseUrl(link.searchParams.get(name));
    if (carried) return `${carried.origin}/`;
  }
  /* No merchant URL and nothing being redirected to: the link is the shop's own
     address with the campaign hung off it, as eBay's is. Refused for anything
     whose path belongs to a redirect script, because that host is a network and
     its front door is not a shop. */
  return REDIRECTOR_PATH.test(link.pathname) ? "" : `${link.origin}/`;
}

/**
 * A commissionable link to the shop this product is sold by.
 *
 * Returns `{url, network}`, or null when no link can be derived from the
 * product's own affiliate link.
 */
function storefrontUrl(product) {
  const link = parseUrl(product?.affiliate_url);
  if (!link) return null;
  const home = merchantHome(product, link);
  if (!home) return null;

  /* Awin's product-click link carries no destination at all — just the product
     id, the advertiser and us. Its deep-link form takes the same advertiser and
     publisher and an arbitrary destination on that advertiser's site. */
  if (/(?:^|\.)awin1\.com$/i.test(link.hostname) && /pclick\.php$/i.test(link.pathname)) {
    const merchantId = link.searchParams.get("m");
    const affiliateId = link.searchParams.get("a");
    if (!merchantId || !affiliateId) return null;
    const deepLink = new URL("https://www.awin1.com/cread.php");
    deepLink.searchParams.set("awinmid", merchantId);
    deepLink.searchParams.set("awinaffid", affiliateId);
    deepLink.searchParams.set("ued", home);
    deepLink.searchParams.set("clickref", CLICK_REF);
    return {url:deepLink.toString(), network:"Awin"};
  }

  /* Every other redirector we deal with names its destination in the query, so
     the whole link stands as it is with one parameter changed. */
  for (const name of DESTINATION_PARAMS) {
    if (!link.searchParams.has(name)) continue;
    link.searchParams.set(name, home);
    if (/(?:^|\.)awin1\.com$/i.test(link.hostname)) link.searchParams.set("clickref", CLICK_REF);
    if (/(?:^|\.)linksynergy\.com$/i.test(link.hostname)) link.searchParams.set("u1", CLICK_REF);
    return {url:link.toString(), network:link.hostname.replace(/^www\./, "")};
  }

  /* eBay puts its tracking on the shop's own address rather than in front of
     it, so the front door is that address with the path removed and the
     campaign left untouched. Only for a link that is already pointing at the
     shop: a redirect script keeps its path and is refused above. */
  if (REDIRECTOR_PATH.test(link.pathname)) return null;
  const shop = parseUrl(home);
  if (!shop || shop.hostname !== link.hostname) return null;
  if (!DIRECT_CAMPAIGN_PARAMS.some(name => link.searchParams.get(name))) return null;
  link.pathname = "/";
  /* An encoded description of the listing we just removed from the address. It
     means nothing on a front page and is not ours to reinterpret, so it goes
     with the item it described. */
  link.searchParams.delete("amdata");
  if (link.searchParams.has("customid")) {
    link.searchParams.set("customid", `${link.searchParams.get("customid")}-store`.slice(0, 256));
  }
  return {url:link.toString(), network:link.hostname.replace(/^www\./, "")};
}

module.exports = { storefrontUrl, CLICK_REF };
