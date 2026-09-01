const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

class TestDatabase {
  constructor(filename) { this.database = new DatabaseSync(filename); }
  pragma(value) { this.database.exec(`PRAGMA ${value}`); }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all:(...params) => statement.all(...params),
      get:(...params) => statement.get(...params),
      run:(...params) => statement.run(...params)
    };
  }
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-automation-"));

const { RETAILERS, feedDefinitions } = require("../src/retailerCatalog");
const { searchAll, searchForAssistant } = require("../src/providers/registry");
const { allowedByFeedPolicy, download, parseDelimited, parseRecords, safeFeedUrl } = require("../src/providers/affiliateFeed");
const { scoreOffers, selectUniqueProducts } = require("../src/ranker");
const { refreshMarket, sortByCurrentScore } = require("../src/refresh");
const { recalculateCatalog } = require("../src/catalogRecalculation");
const { missingConfiguredProviders } = require("../src/catalogRecovery");
const db = require("../src/db");

assert(RETAILERS.length >= 20, "The complete target retailer catalog is missing");
for (const retailer of ["Amazon", "eBay", "Walmart", "Target", "Best Buy", "Tribesigns", "Mooncool", "Giftlab", "King Koil", "Currys", "Fnac", "Darty", "MediaMarkt", "Saturn", "OTTO", "Samsung"]) {
  assert(RETAILERS.some(item => item.name === retailer), `${retailer} is missing from retailer coverage`);
}
assert.throws(() => safeFeedUrl("http://localhost/feed.csv"), /public HTTPS/);
assert.strictEqual(parseDelimited('id,title\n1,"A, B"\n')[0].title, "A, B");
assert.strictEqual(parseRecords({body:"id|product_name\n1|Mooncool TK1\n", contentType:"text/csv", pathname:"/feed"}, "csv")[0].product_name, "Mooncool TK1");
assert.strictEqual(parseRecords({body:'{"products":[{"id":"1"}]}', contentType:"application/json", pathname:"/feed"}).length, 1);
assert.strictEqual(parseRecords({body:"<products><product><id>1</id><title>Test</title></product></products>", contentType:"application/xml", pathname:"/feed"}).length, 1);

const feedEnv = {
  AFFILIATE_FEED_TARGET_US_URL:"https://feed.test/target.csv",
  AFFILIATE_FEED_TRIBESIGNS_US_URL:"https://productdata.awin.com/tribesigns-us.csv.gz",
  AFFILIATE_FEED_MOONCOOL_US_URL:"https://productdata.awin.com/mooncool-us.csv.gz",
  AFFILIATE_FEED_MOONCOOL_CA_URL:"https://productdata.awin.com/mooncool-ca.csv.gz",
  AFFILIATE_FEED_GIFTLAB_US_URL:"https://productdata.awin.com/giftlab-us.csv.gz",
  AFFILIATE_FEED_KING_KOIL_US_URL:"https://productdata.awin.com/king-koil-us.csv.gz"
};
const definitions = feedDefinitions(feedEnv);
assert.strictEqual(definitions.length, 6);
assert.strictEqual(definitions.find(item => item.id === "target-us").retailerName, "Target");
assert.strictEqual(definitions.find(item => item.id === "tribesigns-us").retailerName, "Tribesigns");
assert.strictEqual(definitions.find(item => item.id === "giftlab-us").retailerName, "Giftlab");
const kingKoilDefinition = definitions.find(item => item.id === "king-koil-us");
assert.strictEqual(kingKoilDefinition.retailerName, "King Koil");
assert.strictEqual(
  allowedByFeedPolicy({title:"King Koil Luxury Air Mattress", category:"Mattresses"}, kingKoilDefinition),
  true,
  "A King Koil mattress was rejected",
);
assert.strictEqual(
  allowedByFeedPolicy({title:"King Koil Replacement Pump", category:"Mattress Accessories"}, kingKoilDefinition),
  false,
  "King Koil accessories were not excluded from the mattress feed",
);
const giftlabDefinition = definitions.find(item => item.id === "giftlab-us");
/*
 * This asserted 3,000, on the reasoning that the feed was small enough to keep
 * whole. Keeping it whole is what made it the site: 2,356 of 2,548 listings,
 * ninety two percent from one gift supplier, with 19 left in Electronics and 7
 * in Home & Kitchen. A partner review read that as a gift shop wearing a deals
 * site's clothes, and was right.
 *
 * What has to hold now is the opposite: no single feed may be large enough to
 * be the catalogue on its own.
 */
assert(
  giftlabDefinition.maxProducts <= 600,
  "One feed is allowed to fill the catalogue again",
);
assert(
  giftlabDefinition.maxProducts >= 100,
  "Giftlab is capped so low it is no longer a real supplier",
);
assert.strictEqual(
  allowedByFeedPolicy({title:"Custom Sexy Apron", category:"Gifts"}, giftlabDefinition),
  false,
  "Giftlab explicit adult title was not rejected",
);
assert.strictEqual(
  allowedByFeedPolicy({title:"Custom Face Boxer Briefs", category:"Lingerie"}, giftlabDefinition),
  false,
  "Giftlab lingerie category was not rejected",
);
assert.strictEqual(
  allowedByFeedPolicy({title:"Personalized Family Keychain", category:"Gifts"}, giftlabDefinition),
  true,
  "A normal Giftlab product was rejected",
);
assert.deepStrictEqual(definitions.filter(item => item.retailerId === "mooncool").map(item => item.markets[0]), ["us", "ca"]);
const customDefinitions = feedDefinitions({AFFILIATE_FEEDS_JSON:JSON.stringify([{
  id:"future-store", retailerName:"Future Store", market:"ca", url:"https://feed.test/future.json", format:"json"
}])});
assert.strictEqual(customDefinitions[0].source, "feed-future-store", "A future retailer cannot be added without code changes");
assert.deepStrictEqual(
  sortByCurrentScore([{id:1, score:61, current_price:10}, {id:2, score:78, current_price:40}]).map(item => item.id),
  [2, 1],
  "A preserved daily selection must still put the highest current score first"
);

/**
 * A GTIN-13 with a correct check digit.
 *
 * The fixture used to invent barcodes by concatenation, which produced strings
 * that look like barcodes and fail validation. That went unnoticed while
 * nothing depended on identity; the drop's identity requirement does, so these
 * now have to be real. Weights alternate 1,3 from the left across the first
 * twelve digits.
 */
function gtin13(body12) {
  const digits = String(body12).padStart(12, "0").slice(-12).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return `${digits.join("")}${(10 - (sum % 10)) % 10}`;
}

function records(retailer, prefix, duplicateFirst = false) {
  return Array.from({length:6}, (_, index) => ({
    id:`${prefix}-${index + 1}`,
    title:`${retailer} Product ${index + 1}`,
    description:`Verified ${retailer} affiliate product`,
    category:"home gadgets",
    brand:"Acme",
    gtin:duplicateFirst && index === 0
      ? "00012345678905"
      : gtin13(`0001234567${prefix === "t" ? "1" : "2"}${index}`),
    price:String(20 + index),
    original_price:String(30 + index),
    currency:"USD",
    image_url:`https://images.test/${prefix}-${index + 1}.jpg`,
    affiliate_url:`https://click.test/${prefix}-${index + 1}`,
    seller_name:retailer,
    shipping_summary:"Free shipping",
    return_summary:"30 day returns",
    availability:"In stock",
    rating:"4.7",
    review_count:"1200"
  }));
}

const targetRecords = records("Target", "t", true);
const bestBuyRecords = records("Best Buy", "b", true);
bestBuyRecords[0].gtin = targetRecords[0].gtin;
targetRecords[5].rating = "0";
targetRecords[5].review_count = "0";
targetRecords[5].original_price = targetRecords[5].price;

const originalFetch = global.fetch;
let feedFetchCount = 0;
global.fetch = async url => {
  feedFetchCount += 1;
  const value = String(url);
  if (value.includes("failed")) return new Response("no", {status:503});
  const body = value.includes("target") ? targetRecords : bestBuyRecords;
  return new Response(JSON.stringify({products:body}), {status:200, headers:{"content-type":"application/json"}});
};

const market = {
  code:"us",
  name:"United States",
  currency:"USD",
  timezone:"America/New_York",
  searchKeywords:["home gadgets"],
  affiliateTag:""
};
const config = {
  provider:"multi",
  markets:["us"],
  affiliateFeeds:[
    {id:"target-us", source:"feed-target", retailerId:"target", retailerName:"Target", network:"Impact", markets:["us"], url:"https://feed.test/target.json", format:"json", headersJson:"", fieldMapJson:""},
    {id:"best-buy-us", source:"feed-best-buy", retailerId:"best-buy", retailerName:"Best Buy", network:"Impact", markets:["us"], url:"https://feed.test/bestbuy.json", format:"json", headersJson:"", fieldMapJson:""},
    {id:"wayfair-us", source:"feed-wayfair", retailerId:"wayfair", retailerName:"Wayfair", network:"CJ", markets:["us"], url:"https://feed.test/failed.json", format:"json", headersJson:"", fieldMapJson:""}
  ],
  ebayClientId:"",
  ebayClientSecret:"",
  ebayCampaignId:"",
  rainforestApiKey:"",
  bluecartApiKey:"",
  maxProductsPerSource:500,
  staleOfferHours:48,
  marketConfig:() => market,
  walmartAffiliateTemplateForMarket:() => ""
};

(async () => {
  try {
    const feedFetchesBeforeAssistant = feedFetchCount;
    const assistantProducts = await searchForAssistant(config, {
      query:"Acme Product",
      market
    });
    assert.deepStrictEqual(assistantProducts, [], "Delia unexpectedly parsed a full affiliate feed during a chat request");
    assert.strictEqual(
      feedFetchCount,
      feedFetchesBeforeAssistant,
      "Delia downloaded affiliate feeds instead of using their refreshed catalog products",
    );

    const awinCsv = "aw_product_id|product_name|search_price|currency|merchant_image_url|aw_deep_link\n1|Mooncool TK1|1299|USD|https://images.test/tk1.jpg|https://www.awin1.com/cread.php?id=1\n";
    const compressed = zlib.gzipSync(Buffer.from(awinCsv));
    const downloaded = await download({url:"https://productdata.awin.com/mooncool", headersJson:""}, async () =>
      new Response(compressed, {status:200, headers:{"content-type":"application/octet-stream"}}));
    assert.strictEqual(parseRecords(downloaded, "csv")[0].product_name, "Mooncool TK1", "Headerless Awin gzip response was not decoded");

    const googleFeed = [
      "id,title,description,google_product_category,brand,price,sale_price,image_link,link,availability",
      "tk2,Mooncool TK2,Electric trike,Sporting Goods > Outdoor Recreation > Cycling > Tricycles,mooncool,1699 USD,1399 USD,https://images.test/tk2.jpg,https://www.awin1.com/cread.php?id=2,out_of_stock",
      "helmet,Mooncool Helmet,Helmet,Sporting Goods > Outdoor Recreation > Cycling > Bicycle Accessories,Mooncool,59 USD,,https://images.test/helmet.jpg,https://www.awin1.com/cread.php?id=3,in_stock"
    ].join("\n");
    const mooncoolDefinition = feedDefinitions({AFFILIATE_FEED_MOONCOOL_US_URL:"https://productdata.awin.com/mooncool-google.csv"})[0];
    const googleProducts = await require("../src/providers/affiliateFeed").searchProducts({
      definition:{...mooncoolDefinition, format:"csv"},
      market:{code:"us", currency:"USD"},
      fetchImpl:async () => new Response(googleFeed, {status:200, headers:{"content-type":"text/csv"}})
    });
    assert.strictEqual(googleProducts.length, 1, "Mooncool accessories were not excluded from the main-product feed");
    assert.strictEqual(googleProducts[0].brand, "Mooncool", "Mooncool brand casing was not normalized");
    assert.strictEqual(googleProducts[0].current_price, 1399, "Google sale_price was not preferred");
    assert.strictEqual(googleProducts[0].original_price, 1699, "Google regular price was not retained");
    assert.strictEqual(googleProducts[0].availability, "Out of stock", "Google availability was not normalized");

    const tribesignsRows = Array.from({length:2101}, (_, index) => index === 2100
      ? `desk-1,Tribesigns Executive Desk,Furniture for a home office,Furniture > Office Furniture > Desks,Tribesigns,499.99 USD,399.99 USD,https://images.test/desk.jpg,https://tribesigns.test/desk,https://www.awin1.com/cread.php?awinaffid=3018019&ued=desk,in_stock`
      : index === 2099
        ? `desk-oos,Tribesigns Executive Desk,Furniture for a home office,Furniture > Office Furniture > Desks,Tribesigns,599.99 USD,299.99 USD,https://images.test/desk-oos.jpg,https://tribesigns.test/desk-oos,https://www.awin1.com/cread.php?awinaffid=3018019&ued=desk-oos,out_of_stock`
        : `shelf-${index},Tribesigns Shelf ${index},Storage shelf,Furniture > Shelving,Tribesigns,99.99 USD,,https://images.test/shelf-${index}.jpg,https://tribesigns.test/shelf-${index},https://www.awin1.com/cread.php?awinaffid=3018019&ued=shelf-${index},in_stock`);
    const tribesignsFeed = [
      "id,title,description,google_product_category,brand,price,sale_price,image_link,link,aw_deep_link,availability",
      ...tribesignsRows
    ].join("\n");
    const tribesignsDefinition = feedDefinitions({AFFILIATE_FEED_TRIBESIGNS_US_URL:"https://productdata.awin.com/tribesigns-google.csv"})[0];
    const tribesignsProducts = await require("../src/providers/affiliateFeed").searchProducts({
      definition:{...tribesignsDefinition, format:"csv"},
      market:{code:"us", currency:"USD"},
      keywords:["executive desk"],
      fetchImpl:async () => new Response(tribesignsFeed, {status:200, headers:{"content-type":"text/csv"}})
    });
    assert.strictEqual(tribesignsProducts[0].external_id, "desk-1", "Delia search did not reach a relevant Tribesigns product after the old 2,000-row limit");
    assert.strictEqual(tribesignsProducts[0].current_price, 399.99, "Tribesigns sale price was not preferred");
    assert.strictEqual(tribesignsProducts[0].original_price, 499.99, "Tribesigns regular price was not retained");
    assert(tribesignsProducts[0].affiliate_url.includes("awinaffid=3018019"), "Tribesigns untracked merchant URL replaced the Awin deep link");
    assert(!tribesignsProducts.some(product => product.external_id === "desk-oos"), "Delia search retained an unavailable Tribesigns offer");
    const expandedGiftlabProducts = await require("../src/providers/affiliateFeed").searchProducts({
      definition:{...giftlabDefinition, url:"https://productdata.awin.com/giftlab-expanded.csv", format:"csv"},
      market:{code:"us", currency:"USD"},
      fetchImpl:async () => new Response(tribesignsFeed, {status:200, headers:{"content-type":"text/csv"}})
    });
    /*
     * This asserted 2,101 — every row of the fixture — to prove a hidden
     * 2,000-row default was not silently truncating the feed. The point was
     * never the number: it was that the feed's own configured cap decides,
     * rather than some ceiling nobody set. Now that Giftlab is deliberately
     * capped, asserting the fixture's full length would assert the very thing
     * that made the site a gift shop.
     */
    assert.strictEqual(
      expandedGiftlabProducts.length,
      giftlabDefinition.maxProducts,
      "The feed returned something other than its own configured limit, so a ceiling nobody set is deciding",
    );

    const sourceLimited = await searchAll({
      ...config,
      affiliateFeeds:[{...config.affiliateFeeds[0], maxProducts:4}],
    }, market);
    assert.strictEqual(sourceLimited.reports[0].found, 4, "A feed-specific catalog limit was ignored");

    const targeted = await searchAll(config, market, {providerIds:["feed-target-us"]});
    assert.deepStrictEqual(targeted.reports.map(report => report.id), ["feed-target-us"], "Targeted startup recovery searched unrelated sources");

    const scored = scoreOffers([...targetRecords, ...bestBuyRecords].map((item, index) => ({
      ...item,
      external_id:item.id,
      product_key:`gtin:${item.gtin}`,
      current_price:Number(item.price),
      original_price:Number(item.original_price),
      image_url:item.image_url,
      affiliate_url:item.affiliate_url,
      retailer_name:item.seller_name,
      seller_name:item.seller_name,
      shipping_summary:item.shipping_summary,
      return_summary:item.return_summary,
      availability:item.availability,
      rating:Number(item.rating),
      review_count:Number(item.review_count),
      source:index < 6 ? "feed-target" : "feed-best-buy",
      source_rank:(index % 6) + 1
    })), {currency:"USD", minimumRating:0, minimumReviews:0, minimumScore:0});
    assert.strictEqual(scored.length, 12, "Multi-store scoring discarded an alternative offer");
    assert.strictEqual(selectUniqueProducts(scored).length, 11, "Daily selection did not deduplicate the matching product");
    assert(scored.some(product => product.score < 60), "The catalog fixture is missing its below-selection offer");

    assert.deepStrictEqual(
      missingConfiguredProviders(config, "us"),
      ["feed-target-us", "feed-best-buy-us", "feed-wayfair-us"],
      "Existing products from another retailer can hide newly configured sources"
    );

    const result = await refreshMarket(config, "us");
    assert.strictEqual(result.selected, 10);
    assert.strictEqual(result.sources.length, 3);
    assert.strictEqual(result.sources.filter(source => source.status === "success").length, 2);
    assert.strictEqual(result.sources.filter(source => source.status === "failed").length, 1);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products").get().n, 12, "All valid store offers were not persisted");
    assert.deepStrictEqual(result.snapshots, {inserted:12, duplicate:0, quarantined:0, duplicateQuarantine:0});
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history WHERE ingestion_run_id IS NOT NULL").get().n, 12, "The refresh did not append one snapshot per offer");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history WHERE price_minor IS NULL OR our_observed_at IS NULL").get().n, 0, "Snapshot contract fields were not populated");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_snapshot_quarantine").get().n, 0, "Valid offers were quarantined");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products WHERE status='published' AND score<60").get().n, 1, "A valid catalog offer disappeared only because it missed the Daily Drop threshold");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products WHERE product_key=?").get(`gtin:${targetRecords[0].gtin}`).n, 2, "Matching cross-store offers were not retained");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM daily_drops").get().n, 10);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM source_refresh_runs").get().n, 3);
    assert.deepStrictEqual(
      missingConfiguredProviders(config, "us"),
      ["feed-wayfair-us"],
      "Startup recovery did not distinguish populated sources from a failed empty source"
    );
    const expandedTargetConfig = {
      ...config,
      affiliateFeeds:[{...config.affiliateFeeds[0], maxProducts:10}],
      maxProductsPerSource:6,
    };
    assert.deepStrictEqual(
      missingConfiguredProviders(expandedTargetConfig, "us"),
      ["feed-target-us"],
      "Startup recovery did not re-import a source that was truncated at the old shared limit",
    );
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM automation_alerts WHERE resolved_at IS NULL").get().n, 1);
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM distribution_queue WHERE status='ready'").get().n, 2);
    assert(db.prepare("SELECT COUNT(*) n FROM products WHERE provider_external_id LIKE 'feed-%:%'").get().n === 12, "Provider IDs are not source-qualified");
    const [placeholderProduct, unavailableProduct] = db.prepare("SELECT id FROM products ORDER BY id LIMIT 2").all();
    db.prepare("UPDATE products SET product_key='gtin:Does not apply',gtin='Does not apply',upc='',ean='',brand='',model_number='',mpn='' WHERE id=?").run(placeholderProduct.id);
    db.prepare("UPDATE products SET availability='Unavailable',status='published' WHERE id=?").run(unavailableProduct.id);
    const recalculated = recalculateCatalog(db, ["us"], {force:true, selectionMarkets:["us"]});
    assert.strictEqual(recalculated.changed, true);
    assert(!/does.*apply/i.test(db.prepare("SELECT product_key FROM products WHERE id=?").get(placeholderProduct.id).product_key), "Placeholder ID survived catalog recalculation");
    assert.strictEqual(db.prepare("SELECT status FROM products WHERE id=?").get(unavailableProduct.id).status, "archived", "Unavailable product remained public");
    assert(db.prepare("SELECT COUNT(*) n FROM daily_drops WHERE market='us'").get().n <= 10, "Daily selection was not rebuilt");
    const committedSnapshots = db.prepare("SELECT COUNT(*) n FROM price_history WHERE ingestion_run_id IS NOT NULL").get().n;
    const committedCatalog = db.prepare("SELECT COUNT(*) n FROM products").get().n;
    db.exec(`
      CREATE TRIGGER simulate_snapshot_transaction_failure
      BEFORE UPDATE ON products
      BEGIN
        SELECT RAISE(ABORT, 'simulated snapshot transaction failure');
      END;
    `);
    await assert.rejects(refreshMarket(config, "us"), /simulated snapshot transaction failure/);
    db.exec("DROP TRIGGER simulate_snapshot_transaction_failure");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM products").get().n, committedCatalog, "A failed run changed the committed catalog");
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history WHERE ingestion_run_id IS NOT NULL").get().n, committedSnapshots, "A failed run changed committed snapshot history");
    const secondRun = await refreshMarket(config, "us");
    assert.deepStrictEqual(secondRun.snapshots, {inserted:12, duplicate:0, quarantined:0, duplicateQuarantine:0});
    assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM price_history WHERE ingestion_run_id IS NOT NULL").get().n, 24, "An unchanged price was not appended for the next ingestion run");
    assert.strictEqual(db.prepare(`
      SELECT COUNT(*) n FROM (
        SELECT offer_id,ingestion_run_id,COUNT(*) copies
        FROM price_history
        WHERE ingestion_run_id IS NOT NULL
        GROUP BY offer_id,ingestion_run_id
        HAVING copies>1
      )
    `).get().n, 0, "A run created duplicate offer snapshots");
    console.log("Full multi-retailer automation validation passed.");
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
