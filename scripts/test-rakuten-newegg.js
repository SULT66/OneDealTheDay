const assert = require("assert");
const {
  createRakutenClient,
  matchesSearchIntent,
  parseProduct,
  searchProducts
} = require("../src/providers/rakutenNewegg");
const { nativeProviders } = require("../src/providers/registry");
const { coverage } = require("../src/retailerCatalog");

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<result>
  <TotalMatches>2</TotalMatches>
  <item>
    <mid>44583</mid>
    <merchantname>Newegg</merchantname>
    <linkid>1001</linkid>
    <sku>GPU-RTX-TEST</sku>
    <productname><![CDATA[Test RTX Graphics Card 16GB]]></productname>
    <category><primary>Electronics</primary><secondary>Computer Components~~Graphics Cards</secondary></category>
    <price currency="USD">699.99</price>
    <saleprice currency="USD">649.99</saleprice>
    <upccode>012345678905</upccode>
    <description><short><![CDATA[New graphics card]]></short><long><![CDATA[Fast test GPU.]]></long></description>
    <linkurl>https://click.linksynergy.com/test-newegg-product</linkurl>
    <imageurl>https://images.example.test/gpu.jpg</imageurl>
  </item>
  <item>
    <mid>44583</mid>
    <merchantname>Newegg</merchantname>
    <linkid>1002</linkid>
    <sku>CABLE-TEST</sku>
    <productname>Cat 7 Ethernet Cable for Gaming</productname>
    <category><primary>Electronics</primary><secondary>Accessories~~Network Cables</secondary></category>
    <price currency="USD">6.30</price>
    <linkurl>https://click.linksynergy.com/test-cable</linkurl>
    <imageurl>https://images.example.test/cable.jpg</imageurl>
  </item>
</result>`;

async function run() {
  const parsed = parseProduct(XML.match(/<item>([\s\S]*?)<\/item>/)[1]);
  assert.strictEqual(parsed.productName, "Test RTX Graphics Card 16GB");
  assert.strictEqual(parsed.salePrice, 649.99);
  assert.strictEqual(parsed.saleCurrency, "USD");
  assert(matchesSearchIntent(parsed, "graphics card"));
  assert(!matchesSearchIntent(parsed, "gaming laptop"));

  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    calls.push({url, options});
    if (url.endsWith("/token")) {
      return new Response(JSON.stringify({access_token:"test-access-token", expires_in:3600}), {
        status:200,
        headers:{"Content-Type":"application/json"}
      });
    }
    return new Response(XML, {status:200, headers:{"Content-Type":"application/xml"}});
  };

  const client = createRakutenClient({
    clientId:"test-client",
    clientSecret:"test-secret",
    publisherSid:"1234567",
    fetchImpl
  });
  const raw = await client.search("graphics card", "44583");
  assert.strictEqual(raw.length, 2);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(String(calls[0].options.body), "scope=1234567");
  assert.strictEqual(calls[1].options.headers.Authorization, "Bearer test-access-token");
  const requestUrl = new URL(calls[1].url);
  assert.strictEqual(requestUrl.searchParams.get("mid"), "44583");
  assert.strictEqual(requestUrl.searchParams.get("keyword"), "graphics card");
  assert.strictEqual(requestUrl.searchParams.has("sort"), false, "Unsupported empty sort parameters must not be sent");

  const products = await searchProducts({
    clientId:"test-client",
    clientSecret:"test-secret",
    publisherSid:"1234567",
    mid:"44583",
    keywords:["graphics card"],
    market:{code:"us", currency:"USD"},
    client:{search:async () => raw}
  });
  assert.strictEqual(products.length, 1, "Irrelevant cable should be removed by strict title/category matching");
  assert.strictEqual(products[0].retailer_name, "Newegg");
  assert.strictEqual(products[0].source, "newegg");
  assert.strictEqual(products[0].current_price, 649.99);
  assert.strictEqual(products[0].original_price, 699.99);
  assert(products[0].affiliate_url.includes("linksynergy.com"));
  assert.strictEqual(products[0].shipping_cost, null, "Unknown shipping must not be invented");
  /*
   * Nor must unknown stock.
   *
   * This fixture carries no <instock> tag, which is what Newegg's feed
   * actually looks like — and the importer answered that silence with "In
   * stock" on the argument that a listing coming back from today's search is
   * a real answer from the shop. It is, and it is a different sentence: being
   * advertised today says the shop still sells the thing, not that a unit is
   * waiting. Every listing in the catalogue claimed stock, 1,595 of them on
   * the strength of nothing, and the product page turned that into
   * schema.org/InStock for Google.
   *
   * The useful half of that argument is kept by checked_at, which says when
   * the shop last advertised the row.
   */
  assert.strictEqual(products[0].availability, "", "Unknown stock must not be reported as in stock");
  assert.ok(products[0].checked_at, "the date the shop last advertised it is what we do know");

  /* A merchant that does fill the field keeps its own answer, in both
     directions. */
  const withStock = await searchProducts({
    clientId:"test-client",
    clientSecret:"test-secret",
    publisherSid:"1234567",
    mid:"44583",
    keywords:["graphics card"],
    market:{code:"us", currency:"USD"},
    client:{search:async () => raw.map(item => ({...item, inStock:"yes"}))}
  });
  assert.strictEqual(withStock[0].availability, "In stock");

  const soldOut = await searchProducts({
    clientId:"test-client",
    clientSecret:"test-secret",
    publisherSid:"1234567",
    mid:"44583",
    keywords:["graphics card"],
    market:{code:"us", currency:"USD"},
    client:{search:async () => raw.map(item => ({...item, inStock:"no"}))}
  });
  assert.strictEqual(soldOut[0].availability, "Out of stock");

  await assert.rejects(
    () => searchProducts({
      clientId:"test-client",
      clientSecret:"test-secret",
      publisherSid:"1234567",
      keywords:["graphics card"],
      market:{code:"ca"},
      client:{search:async () => raw}
    }),
    /only the US market/
  );

  const registered = nativeProviders({
    rakutenClientId:"test-client",
    rakutenClientSecret:"test-secret",
    rakutenPublisherSid:"1234567",
    rakutenNeweggMid:"44583",
    rakutenNeweggKeywords:["graphics card"]
  });
  assert(registered.some(provider => provider.id === "newegg" && provider.source === "newegg"));
  const neweggCoverage = coverage(registered).find(retailer => retailer.id === "newegg");
  assert.deepStrictEqual(neweggCoverage.configuredMarkets, ["us"]);

  console.log("Rakuten Newegg provider test passed");
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
