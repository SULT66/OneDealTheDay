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
