const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const port = 28000 + process.pid % 10000;
const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  PORT:String(port), BACKEND_API_URL:base,
  DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(), "odd-diary-signup-")),
  WEBSITE_SITE_NAME:"diary-signup-test", SUPPORTED_MARKETS:"us,ca,uk,fr,de",
  EBAY_CLIENT_ID:"fixture-client", EBAY_CLIENT_SECRET:"fixture-secret", EBAY_CAMPAIGN_ID:"5339179772",
  SENDGRID_API_KEY:"SG.local-test-only", EMAIL_FROM:"info@onedailydrop.com",
});
const nativeFetch = global.fetch;
const productRequests = [];
const mail = [];
global.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.sendgrid.com") {
    mail.push(JSON.parse(options.body));
    return new Response("", {status:202});
  }
  if (url.origin === base && /^\/api\/products\/\d+$/.test(url.pathname)) {
    productRequests.push(url);
    if (url.pathname.endsWith("/219964")) return new Response("Temporary fixture outage", {status:503});
  }
  return nativeFetch(input, options);
};
const config = require("../src/config");
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
const db = require("../src/db");
require("../app");
const now = new Date().toISOString();
const product = {
  id:222102, external_id:"us:ebay:diary-fixture", provider_external_id:"diary-fixture", market:"us",
  title:"USB Four Bay Drive Enclosure", brand:"Fixture", brand_slug:"fixture", category:"Electronics", normalized_category:"Electronics",
  image_url:"https://i.ebayimg.com/images/g/diary/s-l1600.jpg", affiliate_url:"https://www.ebay.com/itm/123456789012?campid=5339179772",
  source:"ebay", retailer_name:"eBay", status:"published", availability:"In stock", currency:"USD", current_price:99,
  rating:4.8, review_count:100, score:80, commerce_quality:80, evidence_confidence:80,
  seller_rating:99.8, seller_feedback_count:1000, shipping_summary:"Free shipping", return_summary:"30-day returns",
  checked_at:now, updated_at:now, first_seen_at:now, last_seen_at:now,
};
db.prepare(`INSERT INTO products(${Object.keys(product).join(",")}) VALUES(${Object.keys(product).map(()=>"?").join(",")})`).run(...Object.values(product));
async function get(route) {
  const response = await nativeFetch(base + route);
  assert.equal(response.status,200,route);
  return response.text();
}
(async () => {
  for (let attempt=0;;attempt++) {
    try {await get("/api/status");break;} catch(error) {if(attempt>100) throw error;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  for (const market of ["ca","de","fr","uk"]) {
    const html = await get(`/${market}/black-friday`);
    assert.match(html,/href="\/us\/black-friday"/);
    assert.match(html,/USD/);
    assert.doesNotMatch(html,/No longer listed|Nicht mehr gelistet|N'est plus en vente/);
    assert.doesNotMatch(html,new RegExp(`/${market}/deal/222102`));
  }
  assert.equal(productRequests.length,0,"other markets must not request the U.S. diary IDs");
  const us = await get("/us/black-friday");
  assert.match(us,/USB Four Bay Drive Enclosure/);
  assert.match(us,/href="\/us\/deal\/222102"/);
  assert.match(us,/Price temporarily unavailable/);
  assert.match(us,/No longer listed/,"a genuine missing U.S. listing must still be represented");
  assert.match(us,/data-odd-transient="1"/,"a temporary failure must not become a cached withdrawal");
  assert(productRequests.every(url=>url.searchParams.get("market")==="us"));

  const response = await nativeFetch(base+"/api/subscribe", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({email:"audit-fixture@example.test",market:"us",source:"homepage"}),
  });
  assert.equal(response.status,201);
  assert.equal(mail.length,1);
  const html = mail[0].content.find(part=>part.type==="text/html").value;
  assert.match(html,/days 1, 3 and 7/);
  assert.match(html,/60 days/);
  assert.doesNotMatch(html,/That's the only email/);
  const fewer = html.match(/href="(https:\/\/www\.onedailydrop\.com\/email\/less\?token=[^"]+)"/);
  assert(fewer,"the confirmation must carry a usable fewer-emails link");
  const preference = new URL(fewer[1]);
  await get(preference.pathname + preference.search);
  const subscriber = db.prepare("SELECT drop_opt_in,digest_opt_in,status FROM subscribers WHERE email=?").get("audit-fixture@example.test");
  assert.equal(subscriber.drop_opt_in,0);
  assert.equal(subscriber.digest_opt_in,1);
  assert.equal(subscriber.status,"active");
  console.log("Audit 7/8: regional diary isolation, U.S. history links, honest outage/missing states, confirmation schedule and working Sunday-only preference passed.");
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
