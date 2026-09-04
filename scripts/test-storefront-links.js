const assert = require("assert");
const { storefrontUrl } = require("../src/storefrontLinks");

/*
 * Every link below was copied out of the live catalogue on 4 September 2026,
 * one per shop, rather than written to suit the code. That matters more here
 * than anywhere else in the suite: the whole file exists to make sure a link we
 * put in front of a buyer actually pays, and a fixture invented alongside the
 * parser proves only that the parser agrees with itself.
 */

const ebay = {
  retailer_name:"eBay",
  retailer_shop_url:"",
  affiliate_url:"https://www.ebay.com/itm/184611993882?mkevt=1&mkcid=1&mkrid=711-53200-19255-0&campid=5339179772&customid=odd-us&toolid=10050"
};
const newegg = {
  retailer_name:"Newegg",
  retailer_shop_url:"",
  affiliate_url:"https://click.linksynergy.com/link?id=kj4GVhxsO9k&offerid=1786142.4458318162374765838213787&type=15&murl=https%3A%2F%2Fwww.newegg.com%2Fasus-gt-axe16000-router%2Fp%2FN82E16833320484"
};
const tribesigns = {
  retailer_name:"Tribesigns",
  retailer_shop_url:"https://tribesigns.com/products/057-tribesigns-12-shelves-bookshelf?variant=36574360010907",
  affiliate_url:"https://www.awin1.com/cread.php?awinmid=92307&awinaffid=3018019&ued=https%3A%2F%2Ftribesigns.com%2Fproducts%2F057-tribesigns-12-shelves-bookshelf%3Fvariant%3D36574360010907"
};
const giftlab = {
  retailer_name:"Giftlab",
  retailer_shop_url:"https://www.giftlab.com/products/custom-air-fresheners-with-name",
  affiliate_url:"https://www.awin1.com/pclick.php?p=41887621589&a=3018019&m=95201"
};

/* ------------------------------------------------ the front door, not a product */

/*
 * The reason this file was written.
 *
 * "Shop all at Tribesigns" pointed at retailer_shop_url, which is the shop's
 * own product page with no network in front of it. It was the right words over
 * a link that paid nothing and did not even go to the shop's front page.
 */
const tribesignsLink = storefrontUrl(tribesigns);
assert(tribesignsLink, "no store link can be derived from a working Awin deep link");
const tribesignsUrl = new URL(tribesignsLink.url);
assert.strictEqual(tribesignsUrl.hostname, "www.awin1.com", "the store link bypasses Awin, so the visit is never recorded");
assert.strictEqual(tribesignsUrl.searchParams.get("awinmid"), "92307", "the advertiser id changed on the way through");
assert.strictEqual(tribesignsUrl.searchParams.get("awinaffid"), "3018019", "the publisher id changed, so the commission goes to somebody else");
assert.strictEqual(
  tribesignsUrl.searchParams.get("ued"),
  "https://tribesigns.com/",
  "the store link still lands on one product rather than the shop",
);

/*
 * Awin's other link shape carries no destination at all — just a product id,
 * the advertiser and us. Its deep-link form takes the same two ids and any
 * address on that advertiser's site, so a shop whose feed uses pclick is not
 * left without a store link.
 */
const giftlabLink = storefrontUrl(giftlab);
assert(giftlabLink, "a shop whose feed uses Awin product-click links gets no store link");
const giftlabUrl = new URL(giftlabLink.url);
assert(/cread\.php$/.test(giftlabUrl.pathname), "the product-click link was not converted to a deep link");
assert.strictEqual(giftlabUrl.searchParams.get("awinmid"), "95201", "the advertiser id was not carried across from the product link");
assert.strictEqual(giftlabUrl.searchParams.get("awinaffid"), "3018019", "the publisher id was not carried across from the product link");
assert.strictEqual(giftlabUrl.searchParams.get("ued"), "https://www.giftlab.com/", "the destination is not the shop's front door");

/* Rakuten names its destination murl and everything else about the link stands
   as it was, because that link is known to work. */
const neweggLink = storefrontUrl(newegg);
assert(neweggLink, "Newegg, three quarters of the catalogue, gets no store link");
const neweggUrl = new URL(neweggLink.url);
assert.strictEqual(neweggUrl.hostname, "click.linksynergy.com", "the store link bypasses Rakuten, so the visit is never recorded");
assert.strictEqual(neweggUrl.searchParams.get("id"), "kj4GVhxsO9k", "the publisher id changed on the way through");
assert.strictEqual(neweggUrl.searchParams.get("murl"), "https://www.newegg.com/", "the store link still lands on one product rather than the shop");

/* eBay hangs its campaign on the shop's own address rather than redirecting
   through a network, so the front door is that address with the path removed
   and the campaign untouched. */
const ebayLink = storefrontUrl(ebay);
assert(ebayLink, "eBay gets no store link, though its campaign is right there in the address");
const ebayUrl = new URL(ebayLink.url);
assert.strictEqual(ebayUrl.hostname, "www.ebay.com", "the eBay store link left eBay");
assert.strictEqual(ebayUrl.pathname, "/", "the eBay store link still points at one item");
assert.strictEqual(ebayUrl.searchParams.get("campid"), "5339179772", "the campaign id was dropped, so the click pays nobody");
assert.strictEqual(ebayUrl.searchParams.get("mkevt"), "1", "eBay's tracking parameters were not carried across");
/* `amdata` is an encoded description of the listing, and the listing is what
   the front-door link no longer points at. */
assert.strictEqual(ebayUrl.searchParams.get("amdata"), null, "item-specific data rides along on a link that is not about an item");

/* ------------------------------------------------------- telling them apart */

/*
 * Without a label of our own on the click, a store link is invisible: its
 * commission arrives in the network's report in the same column as every
 * product link, and there is no way to learn whether the link earns its place.
 */
assert.strictEqual(tribesignsUrl.searchParams.get("clickref"), "odd-store", "Awin store clicks are no longer labelled");
assert.strictEqual(neweggUrl.searchParams.get("u1"), "odd-store", "Rakuten store clicks are no longer labelled");
assert.strictEqual(ebayUrl.searchParams.get("customid"), "odd-us-store", "eBay store clicks are no longer told apart from product clicks");

/* --------------------------------------------------------- refusing to guess */

/*
 * The failure that would cost the most is the one that looks like success.
 *
 * A feed is allowed to give a plain merchant URL as its affiliate link — half
 * the aliases the importer accepts are exactly that — and cutting the path off
 * one produces a shop homepage indistinguishable from a paying link. No link is
 * the right answer; the caller then shows no link at all.
 */
assert.strictEqual(
  storefrontUrl({affiliate_url:"https://www.example-shop.com/products/a-chair", retailer_shop_url:"https://www.example-shop.com/products/a-chair"}),
  null,
  "a merchant URL with no campaign on it is offered as a paying store link",
);

/* An unknown redirector's homepage is not a shop. Stripping the path off one
   would send buyers to the network's own front page. */
assert.strictEqual(
  storefrontUrl({affiliate_url:"https://track.example.net/click?pid=9&campid=7", retailer_shop_url:""}),
  null,
  "an unrecognised redirector's own homepage is offered as a shop",
);

/* Nothing to derive from, so nothing is returned. */
assert.strictEqual(storefrontUrl({}), null, "a product with no affiliate link produces a store link anyway");
assert.strictEqual(storefrontUrl({affiliate_url:"javascript:alert(1)"}), null, "a non-HTTP link is accepted as a store link");


/* ------------------------------------------ where the link is actually offered */

/*
 * The store link has to be on the page a shopper is standing on.
 *
 * When this shipped, the only place offering it was /us/stores, because the
 * Express product page that had carried "Shop all at X" for months is no longer
 * what serves /deal/:id — Next.js is. The link was corrected in dead code and
 * the live product page, the busiest surface on the site, offered nothing.
 */
const fs = require("fs");
const path = require("path");
const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");

const dealPage = read("app", "[market]", "deal", "[id]", "page.tsx");
assert(
  /action=shop_all/.test(dealPage),
  "the product page offers no way through to the shop, only to the one listing",
);
assert(
  /deal\.shopAll \?/.test(dealPage),
  "the product page shows a store link whether or not one can be built, so some of them 404",
);

/* The flag it reads has to be published, or it is false everywhere and the
   link never appears. */
assert(
  /display_shop_all: Boolean\(storefrontUrl\(product\)\)/.test(read("src", "productPresentation.js")),
  "the API no longer says whether a shop has a front door, so no page can offer it",
);
assert(
  /shopAll: Boolean\(raw\.display_shop_all\)/.test(read("lib", "backendAdapter.ts")),
  "the flag stops at the API and never reaches the page",
);

/* The directory itself, which is where somebody browsing shops rather than
   products arrives. The linking moved into the marquee when the page stopped
   being a table, so that is where it is checked now. */
const marquee = read("components", "site", "StoreMarquee.tsx");
/* A shop with no commissionable link reports no host, and a tile with no host
   would be a logo that goes nowhere. */
assert(
  /shops\.filter\(\(shop\) => shop\.host\)/.test(marquee),
  "the directory draws shops it cannot build a paying link for",
);
assert(
  /\/go\/store\/\$\{slugifyCategory\(shop\.retailer\)\}/.test(marquee),
  "the shop directory lists shops without linking to any of them",
);

/*
 * A shop without a favicon must not draw a broken image.
 *
 * /api/retailer-icon answers 404 for a site whose icon it cannot read —
 * Giftlab is one — and a torn-page glyph in a row of real logos reads as the
 * page being broken. Checking `complete && naturalWidth === 0` on mount is the
 * part that matters: the image is requested while the HTML is still streaming,
 * so the error usually fires before React is listening, and an onError handler
 * on its own leaves the placeholder on screen. That is exactly what happened
 * the first time.
 */
const logo = read("components", "site", "StoreLogo.tsx");
assert(
  /naturalWidth === 0/.test(logo),
  "a logo that failed before hydration stays on screen as a broken image again",
);
assert(
  /name\.slice\(0, 1\)/.test(logo),
  "a shop with no readable favicon is drawn with nothing where its logo goes",
);

console.log("Storefront link checks passed: Awin deep and product-click links, Rakuten, eBay, labelled clicks, no guessed link, and links on the pages that need them.");
