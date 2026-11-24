const RETAILERS = Object.freeze([
  {id:"amazon", name:"Amazon", network:"Amazon Associates", markets:["us", "ca", "uk", "fr", "de"], nativeProvider:"amazon"},
  {id:"ebay", name:"eBay", network:"eBay Partner Network", markets:["us", "ca", "uk", "fr", "de"], nativeProvider:"ebay"},
  {id:"walmart", name:"Walmart", network:"Impact / Rakuten", markets:["us", "ca"], nativeProvider:"walmart"},
  {id:"newegg", name:"Newegg", network:"Rakuten Advertising", markets:["us"], nativeProvider:"newegg"},
  {id:"target", name:"Target", network:"Impact", markets:["us"]},
  {id:"best-buy", name:"Best Buy", network:"Best Buy / Impact", markets:["us", "ca"]},
  {id:"home-depot", name:"Home Depot", network:"Impact", markets:["us", "ca"]},
  {id:"lowes", name:"Lowe's", network:"Impact", markets:["us", "ca"]},
  {id:"wayfair", name:"Wayfair", network:"CJ Affiliate", markets:["us", "ca", "uk", "de"]},
  {
    id:"aliexpress", name:"AliExpress", network:"AliExpress Portals",
    markets:["us", "ca", "uk", "fr", "de"], nativeProvider:"aliexpress",
    /* Their links are tracked redirects through s.click.aliexpress.com, so no
       front door can be read off a product the way it can for a shop that
       links to itself. Without this the shop has no tile at all. */
    storefrontHost:"aliexpress.com"
  },
  {
    id:"grommet", name:"Grommet", network:"Awin", markets:["us"],
    /* The shop, not the brand a deep link happened to land on. Grommet sells
       other people's products, so the host read off a product URL was
       getsmartcupper.com — which made the tile point at one supplier and left
       the row without a logo. See shopHost in app.js. */
    storefrontHost:"thegrommet.com",
    maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["not sold separately", "not for sale", "non-delivery", "gift card", "purchase protection"]}
  },
  {
    id:"gmktec", name:"GMKtec", network:"Awin", markets:["us"],
    /* Their storefront runs on a shop platform subdomain that serves no
       favicon; the brand's own domain does. */
    storefrontHost:"gmktec.com",
    maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["not sold separately", "not for sale", "non-delivery", "extended warranty", "purchase protection"]}
  },
  {
    id:"fntcase", name:"FNTCASE", network:"Awin", markets:["us"],
    maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["not sold separately", "not for sale", "non-delivery", "purchase protection"]}
  },
  {
    id:"tribesigns",
    name:"Tribesigns",
    network:"Awin",
    markets:["us"],
    feedPolicy:{
      excludeTitleTerms:["not sold separately", "not for sale", "non-delivery"]
    }
  },
  {
    id:"mooncool",
    name:"Mooncool",
    network:"Awin",
    markets:["us", "ca"],
    /* Same again: 47 products a run and 28 published, because two leaf names
       were listed and the shop uses more than two. The allow-list is gone, but
       the parts are still kept out — a replacement battery is not a bike. */
    feedPolicy:{
      excludeTitleTerms:[
        "not sold separately", "not for sale", "non-delivery",
        "replacement part", "spare part", "repair kit", "inner tube"
      ]
    }
  },
  {
    id:"giftlab",
    name:"Giftlab",
    network:"Awin",
    markets:["us"],
    /*
     * Capped, because keeping this feed in full made it the site.
     *
     * It stood at 3,000 on the reasoning that the feed was small enough to
     * keep whole and that diversity was enforced further down. Diversity in
     * the shortlist was; the shape of the catalogue was not. It grew to 2,356
     * of 2,548 listings, ninety two percent from one gift supplier, leaving 19
     * in Electronics and 7 in Home & Kitchen. A partner review reached the
     * obvious conclusion, which was that a site courting Newegg and Home Depot
     * is a gift shop.
     *
     * A hundred and fifty. Four hundred was the first cut, and it still left
     * Gifts several times larger than any other category: the goal is a shop
     * with a gift section, not a gift shop with a hardware shelf. The cut is by
     * feed order rather than by quality: ranking chooses what surfaces, and it
     * chooses from four hundred rather than from two thousand.
     *
     * AFFILIATE_FEED_GIFTLAB_US_MAX_PRODUCTS overrides this without a deploy,
     * so the number can be tuned against what the other categories reach.
     */
    maxCatalogProducts:150,
    feedPolicy:{
      excludeCategoryLeaves:["Lingerie"],
      excludeTitleTerms:[
        "not sold separately", "not for sale", "non-delivery",
        "sexy", "nude", "naked", "penis", "vagina", "dildo",
        "vibrator", "erotic", "porn", "fuck", "boob"
      ]
    }
  },
  {
    id:"king-koil",
    name:"King Koil",
    network:"Awin",
    markets:["us"],
    /*
     * The leaf filter used to say ["Mattresses"], and the shop has one
     * category leaf spelled exactly that. It sends thirty products a run and
     * we published one, so the site's entire Mattresses & Sleep shelf was a
     * single air bed.
     *
     * The leaf list is gone rather than lengthened. This is a mattress company
     * — every leaf it has is a thing to sleep on — and the taxonomy already
     * files the whole source under Mattresses & Sleep by name. Naming leaves
     * here only re-decides, less well, something already decided.
     */
    feedPolicy:{
      /* Spare parts, not the bed. A replacement pump is a thing you buy when
         something broke, not a thing a deals site puts in front of anybody. */
      excludeCategoryLeaves:["Mattress Accessories"],
      excludeTitleTerms:[
        "not sold separately", "not for sale", "non-delivery",
        "replacement pump", "repair kit", "replacement part", "spare part"
      ]
    }
  },
  {
    id:"fed-fitness",
    name:"FED Fitness",
    network:"Awin",
    markets:["us"],
    /* The Awin feed includes Seel purchase-protection price points as if they
       were products. They are checkout add-ons, not fitness equipment, and
       must never become catalogue cards. */
    feedPolicy:{
      excludeTitleTerms:[
        "worry-free purchase", "purchase protection",
        "not sold separately", "not for sale", "non-delivery"
      ]
    }
  },
  {
    id:"argendon",
    name:"Argendon",
    network:"Awin",
    markets:["us"],
    feedPolicy:{
      titleTerms:["dehumidifier"],
      excludeTitleTerms:["wholesale pack", "package", "hanging kit", "pump kit", "filter", "riser", "replacement part", "gap fee"]
    }
  },
  {
    id:"love-is-a-rose",
    name:"LoveIsARose.com",
    network:"Awin",
    markets:["us"],
    maxCatalogProducts:75,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["the being game"]}
  },
  {
    id:"silver-brush", name:"Silver Brush", network:"Awin", markets:["us"],
    maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"evenskyn", name:"EVENSKYN", network:"Awin", markets:["us"],
    storefrontHost:"evenskyn.com", awinFeedId:"103460", awinFeedFormat:"legacy", maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"outin", name:"OutIn", network:"Awin", markets:["us"],
    storefrontHost:"outin.com", awinFeedId:"F2951", maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"cozeware", name:"Cozeware", network:"Awin", markets:["us"],
    storefrontHost:"cozeware.com",
    // Joined, but the advertiser supplies no product feed. Remain unconfigured
    // until an explicit feed URL is supplied; never invent products or prices.
    maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"toputure", name:"Toputure", network:"Awin", markets:["us"],
    storefrontHost:"toputure.com", awinFeedId:"F3285", maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"tidewe", name:"TideWe", network:"Awin", markets:["us"],
    storefrontHost:"tidewe.com", awinFeedId:"F1386", maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"lumary", name:"Lumary", network:"Awin", markets:["us"],
    storefrontHost:"lumarysmart.com", awinFeedId:"F4323", maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"rockbros", name:"ROCKBROS", network:"Awin", markets:["us"],
    storefrontHost:"rockbrosbike.us", awinFeedId:"F2309", maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"simple-project", name:"Simple Project", network:"Awin", markets:["us"],
    storefrontHost:"simpleprojectus.com", awinFeedId:"F2281", maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"alorair-crawlspace", name:"AlorairCrawlspace", network:"Awin", markets:["us"],
    storefrontHost:"aloraircrawlspace.com", awinFeedId:"F2715", maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "not a product sale", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"piscifun", name:"Piscifun", network:"Awin", markets:["us"],
    storefrontHost:"piscifun.com", awinFeedId:"F1374", maxCatalogProducts:150,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"apolosign", name:"Apolosign", network:"Awin", markets:["us"],
    storefrontHost:"apolosign.com", awinFeedId:"F1090", maxCatalogProducts:50,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"sunaofe", name:"Sunaofe", network:"Awin", markets:["us"],
    storefrontHost:"sunaofe.com", awinFeedId:"F2716", maxCatalogProducts:100,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["custom payment", "price difference link", "purchase protection", "gift card", "not sold separately", "not for sale", "non-delivery"]}
  },
  {
    id:"meowant", name:"MeoWant", network:"Awin", markets:["us"],
    storefrontHost:"meowant.com", awinFeedId:"F734", maxCatalogProducts:50,
    curatedProducts:{
      advertiserId:"55213",
      category:"Pet Supplies",
      verifiedAt:"2026-11-17T07:18:00.000Z",
      products:[
        {
          id:"53440957743401", model:"MW-PF06",
          url:"https://meowant.com/products/meowant-automatic-wet-food-cat-feeder-mw-pf06",
          description:"An automatic cat feeder designed to serve wet food on a schedule.",
          title:"Meowant Automatic Wet Food Cat Feeder-MW-PF06", price:159.99,
          image:"https://meowant.com/cdn/shop/files/PF06.png?v=1794555880&width=1024"
        },
        {
          id:"53426304450857", model:"MW-DF03",
          url:"https://meowant.com/products/meowant-sensor-mode-clean-waste-water-separation-fountain-df03",
          description:"A sensor-activated pet fountain with separate clean-water and waste-water tanks.",
          title:"Meowant Sensor Mode Clean & Waste Water Separation Fountain-DF03", price:99.99,
          image:"https://meowant.com/cdn/shop/files/DF03.png?v=1789461996&width=1024"
        }
      ]
    },
    feedPolicy:{
      titleTerms:["litter box", "feeder", "fountain"],
      excludeTitleTerms:["warranty", "protection", "replacement", "filters", "liners", "bags", "gift card"]
    }
  },
  {
    id:"big-horn-outdoors", name:"Big Horn Outdoors", network:"Awin", markets:["us"],
    storefrontHost:"bighornoutdoor.com", awinFeedId:"106686", awinFeedFormat:"legacy", maxCatalogProducts:50,
    curatedProducts:{
      advertiserId:"117809",
      category:"Sports & Outdoors",
      verifiedAt:"2026-11-17T07:18:00.000Z",
      products:[
        {
          id:"HGB16R2", model:"HGB16R2",
          url:"https://bighornoutdoor.com/products/16-gas-outdoor-pizza-oven",
          description:"An outdoor gas pizza oven with a 16-inch rotating stone and a digital thermometer.",
          title:"16” Gas Pizza Oven - Outdoor Professional Pizza Maker with Auto-Rotating Stone & Digital Thermometer", price:599.99,
          image:"https://bighornoutdoor.com/cdn/shop/files/01_bb190e61-d1e3-49d3-9ec3-1e5738bad59d.jpg?v=1767492057&width=1024"
        },
        {
          id:"VM-KS02-ID", model:"VM-KS02-ID",
          url:"https://bighornoutdoor.com/products/butane-camping-stove-portable-folding-gas-burner-for-camping",
          description:"A folding, single-burner butane stove designed for outdoor cooking and camping.",
          title:"Butane Camping Stove, Portable Folding Gas Burner for Camping", price:79.99,
          image:"https://bighornoutdoor.com/cdn/shop/files/1_dab54204-196d-4786-ac9c-5f37e9947556.jpg?v=1781055625&width=1024"
        },
        {
          id:"LPESL18003", model:"LPESL18003",
          url:"https://bighornoutdoor.com/products/big-horn-outdoors-metal-pizza-peel-13x9-5-inch-set-pizza-paddle-with-fordable-handle",
          description:"A stainless steel paddle for loading and removing pizzas, with a folding handle for storage.",
          title:"Stainless Steel Pizza Peel", price:35.99,
          image:"https://bighornoutdoor.com/cdn/shop/files/61uDnmYRs8L._AC_SL1500.jpg?v=1730106590&width=1024"
        }
      ]
    },
    feedPolicy:{
      titleTerms:["pizza oven", "grill", "smoker"],
      excludeTitleTerms:["cover", "carry bag", "replacement", "gift card"]
    }
  },
  {
    id:"everblog", name:"Everblog", network:"Awin", markets:["us"],
    storefrontHost:"everblog.com", awinFeedId:"F4120", maxCatalogProducts:2000
  },
  {
    id:"radiofence", name:"RadioFence.com", network:"Awin", markets:["us"],
    storefrontHost:"radiofence.com", awinFeedId:"105980", awinFeedFormat:"legacy", maxCatalogProducts:50,
    feedPolicy:{
      titleTerms:["feeder", "fountain"],
      excludeTitleTerms:["filter", "adapter", "replacement", "pump", "gift card"]
    }
  },
  // Memberships verified Joined on 2026-11-24. Reuse the existing server-side
  // publisher credential for their current Google feeds, never legacy copies.
  {
    id:"dima-eyewear", name:"Dima Eyewear", network:"Awin", markets:["us"],
    storefrontHost:"dimaeyewear.com", awinFeedId:"F4005", maxCatalogProducts:2000,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["gift card", "gift box", "mystery box", "purchase protection", "extended warranty"]}
  },
  {
    id:"personalhour", name:"PersonalHour", network:"Awin", markets:["us"],
    storefrontHost:"personalhour.com", awinFeedId:"F3280", maxCatalogProducts:2000,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["gift card", "warranty", "shipping", "delivery service", "assembly service", "order issue call", "custom payment", "price difference", "on-demand", "on demand", "pre-order", "preorder", "custom color", "replacement", "spare part", "lubricant", "cleaner", "sanitizing"]}
  },
  {
    id:"brookwood-med", name:"Brookwood Med", network:"Awin", markets:["us"],
    storefrontHost:"brookwoodmed.com", awinFeedId:"F2671", maxCatalogProducts:2000,
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["gift card", "purchase protection", "custom payment", "price difference"]}
  },
  {
    // Joined, but absent from the publisher's available feed list. Keep opt-in
    // until Awin grants feed access; never guess a feed ID or use a US feed.
    id:"lunzo", name:"Lunzo DE", network:"Awin", markets:["de"],
    storefrontHost:"lunzo.de",
    feedPolicy:{spreadAcrossFeed:true, excludeTitleTerms:["gift card", "geschenkgutschein", "purchase protection", "custom payment"]}
  },
  {id:"currys", name:"Currys", network:"Awin", markets:["uk"]},
  {id:"ao", name:"AO.com", network:"Awin", markets:["uk"]},
  {id:"fnac", name:"Fnac", network:"Awin", markets:["fr"]},
  {id:"cdiscount", name:"Cdiscount", network:"Effiliation", markets:["fr"]},
  {id:"darty", name:"Darty", network:"Effinity", markets:["fr"]},
  {id:"mediamarkt", name:"MediaMarkt", network:"Awin / Easy Marketing", markets:["de"]},
  {id:"saturn", name:"Saturn", network:"Awin / Easy Marketing", markets:["de"]},
  {id:"otto", name:"OTTO", network:"Awin", markets:["de"]},
  {id:"alternate", name:"ALTERNATE", network:"Awin", markets:["de"]},
  {id:"samsung", name:"Samsung", network:"Impact", markets:["ca"]}
]);

function environmentPrefix(retailerId, marketCode) {
  return `AFFILIATE_FEED_${String(retailerId).replace(/-/g, "_").toUpperCase()}_${String(marketCode).toUpperCase()}`;
}

function optionalProductLimit(value, fallback = null) {
  const selected = value == null || String(value).trim() === "" ? fallback : value;
  const parsed = Number(selected);
  return Number.isFinite(parsed) ? Math.max(50, Math.min(10000, Math.round(parsed))) : null;
}

/**
 * A merchant's published delivery terms, used only when the feed itself carries
 * no per-item delivery charge.
 *
 *   {"flat": 0}                     delivery is always free
 *   {"flat": 6.95}                  a flat charge on every order
 *   {"flat": 6.95, "freeOver": 49}  free from 49 up, 6.95 below it
 *
 * Deliberately unset by default. An unconfigured merchant keeps delivery
 * "unknown", which keeps its products out of the Daily Drop — the safe state.
 * Guessing here would put invented delivery costs in front of buyers.
 *
 * Set per feed and market, e.g.
 *   AFFILIATE_FEED_TRIBESIGNS_US_SHIPPING_JSON={"flat":0}
 */
function optionalShippingTerms(value, label) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be an object such as {"flat":0} or {"flat":6.95,"freeOver":49}`);
  }
  const flat = Number(parsed.flat);
  if (!Number.isFinite(flat) || flat < 0) {
    throw new Error(`${label} needs a "flat" delivery charge of 0 or more`);
  }
  const freeOver = Number(parsed.freeOver);
  return {
    flat,
    freeOver: Number.isFinite(freeOver) && freeOver >= 0 ? freeOver : null,
  };
}

/**
 * A merchant's published returns terms, in the merchant's own words, used only
 * when the feed itself carries no returns column — which is nearly always.
 *
 *   AFFILIATE_FEED_TRIBESIGNS_US_RETURNS="30-day returns, buyer pays return shipping"
 *
 * Unset by default, and meant to be copied from the shop's own returns page
 * rather than remembered. It reaches the shopper with the shop's name attached
 * to it, so what is written here is published as that shop's stated policy.
 * That is the whole reason it is configuration and not a table in the code: a
 * policy nobody has read off the merchant's page has no business being in
 * front of a buyer.
 */
function optionalReturnsTerms(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 200) || null;
}

// Newly joined merchants reuse this publisher's existing product-data credential.
// Credentials stay in server environment variables; never store feed keys in code.
function joinedAwinFeedUrl(retailer, env) {
  if (!retailer.awinFeedId) return "";
  let key = String(env.AWIN_PRODUCT_DATA_KEY || "").trim();
  for (const [name, value] of Object.entries(env)) {
    if (key || !/^AFFILIATE_FEED_.*_URL$/.test(name)) continue;
    try {
      const url = new URL(String(value));
      if (url.protocol !== "https:" || url.username || url.password ||
          !["ui.awin.com", "productdata.awin.com"].includes(url.hostname)) continue;
      const modern = /^\/productdata-darwin-download\/publisher\/3018019\/([a-f0-9]{32})\//i.exec(url.pathname);
      const legacy = /\/apikey\/([a-f0-9]{32})\//i.exec(url.pathname);
      key = modern?.[1] || legacy?.[1] || "";
    } catch { /* An unrelated or invalid configured feed is not a credential. */ }
  }
  if (!/^[a-f0-9]{32}$/i.test(key)) return "";
  if (retailer.awinFeedFormat === "legacy") {
    const columns = "aw_deep_link,product_name,aw_product_id,merchant_product_id,merchant_image_url,description,merchant_category,search_price,merchant_name,merchant_id,category_name,currency,delivery_cost,merchant_deep_link,last_updated,brand_name,rrp_price,in_stock,stock_status";
    return `https://productdata.awin.com/datafeed/download/apikey/${key}/language/en/fid/${retailer.awinFeedId}/rid/0/hasEnhancedFeeds/0/columns/${columns}/format/csv/delimiter/%2C/compression/gzip/adultcontent/0/`;
  }
  return `https://ui.awin.com/productdata-darwin-download/publisher/3018019/${key}/1/feed/${retailer.awinFeedId}.csv.gz`;
}

function feedDefinitions(env = process.env) {
  const definitions = [];
  for (const retailer of RETAILERS) {
    for (const market of retailer.markets) {
      const prefix = environmentPrefix(retailer.id, market);
      const url = String(env[`${prefix}_URL`] || joinedAwinFeedUrl(retailer, env)).trim();
      if (!url) continue;
      definitions.push({
        id:`${retailer.id}-${market}`,
        source:`feed-${retailer.id}`,
        retailerId:retailer.id,
        retailerName:retailer.name,
        network:retailer.network,
        markets:[market],
        url,
        format:String(env[`${prefix}_FORMAT`] || "auto").trim().toLowerCase(),
        headersJson:String(env[`${prefix}_HEADERS_JSON`] || "").trim(),
        fieldMapJson:String(env[`${prefix}_FIELD_MAP_JSON`] || "").trim(),
        maxProducts:optionalProductLimit(env[`${prefix}_MAX_PRODUCTS`], retailer.maxCatalogProducts),
        feedPolicy:retailer.feedPolicy || null,
        curatedProducts:market === "us" ? retailer.curatedProducts : undefined,
        shipping:optionalShippingTerms(env[`${prefix}_SHIPPING_JSON`], `${prefix}_SHIPPING_JSON`)
          || retailer.shipping || null,
        returns:optionalReturnsTerms(env[`${prefix}_RETURNS`]) || retailer.returns || null
      });
    }
  }
  const customJson = String(env.AFFILIATE_FEEDS_JSON || "").trim();
  if (customJson) {
    let customFeeds;
    try {
      customFeeds = JSON.parse(customJson);
    } catch (error) {
      throw new Error(`AFFILIATE_FEEDS_JSON is invalid: ${error.message}`);
    }
    if (!Array.isArray(customFeeds)) throw new Error("AFFILIATE_FEEDS_JSON must be an array");
    for (const custom of customFeeds) {
      const retailerId = String(custom?.retailerId || custom?.id || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      const markets = [...new Set((Array.isArray(custom?.markets) ? custom.markets : [custom?.market])
        .map(value => String(value || "").trim().toLowerCase())
        .filter(value => ["us", "ca", "uk", "fr", "de"].includes(value)))];
      const retailerName = String(custom?.retailerName || custom?.name || "").trim();
      const url = String(custom?.url || "").trim();
      if (!retailerId || !retailerName || !url || !markets.length) {
        throw new Error("Every custom affiliate feed needs id, retailerName, HTTPS url and at least one supported market");
      }
      definitions.push({
        id:`${retailerId}-${markets.join("-")}`,
        source:`feed-${retailerId}`,
        retailerId,
        retailerName,
        network:String(custom?.network || "Affiliate feed").trim(),
        markets,
        url,
        format:String(custom?.format || "auto").trim().toLowerCase(),
        headersJson:custom?.headers && typeof custom.headers === "object" ? JSON.stringify(custom.headers) : String(custom?.headersJson || "").trim(),
        fieldMapJson:custom?.fieldMap && typeof custom.fieldMap === "object" ? JSON.stringify(custom.fieldMap) : String(custom?.fieldMapJson || "").trim(),
        maxProducts:optionalProductLimit(custom?.maxProducts),
        shipping:optionalShippingTerms(
          custom?.shipping && typeof custom.shipping === "object"
            ? JSON.stringify(custom.shipping)
            : custom?.shippingJson,
          `Affiliate feed ${retailerId} shipping`,
        ),
        returns:optionalReturnsTerms(custom?.returns)
      });
    }
  }
  return [...new Map(definitions.map(definition => [definition.id, definition])).values()];
}

function coverage(enabledProviders = []) {
  return RETAILERS.map(retailer => {
    const configuredMarkets = retailer.markets.filter(market => enabledProviders.some(provider => {
      const id = String(provider.id || provider.source || provider);
      const matchesRetailer = id === retailer.nativeProvider || id.startsWith(`feed-${retailer.id}-`) || id === `feed-${retailer.id}`;
      return matchesRetailer && (!Array.isArray(provider.markets) || provider.markets.includes(market));
    }));
    return {
      id:retailer.id,
      name:retailer.name,
      network:retailer.network,
      markets:[...retailer.markets],
      configuredMarkets,
      configured:configuredMarkets.length > 0,
      fullyConfigured:configuredMarkets.length === retailer.markets.length
    };
  });
}

module.exports = { RETAILERS, coverage, environmentPrefix, feedDefinitions };
