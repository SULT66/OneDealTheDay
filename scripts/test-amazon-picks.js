const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.PORT = "18152";
process.env.ADMIN_KEY = "test-amazon-retired";
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "odd-amazon-retired-"));
process.env.SUPPORTED_MARKETS = "us";
require("../app.js");
(async () => {
  await new Promise(resolve => setTimeout(resolve, 2500));
  const base = "http://127.0.0.1:18152";
  const headers = {"X-Admin-Key":process.env.ADMIN_KEY,"Content-Type":"application/json"};
  for (const method of ["GET", "POST", "PATCH", "DELETE"]) {
    const response = await fetch(`${base}/api/admin/amazon-picks`, {method,headers});
    assert.strictEqual(response.status, 410);
  }
  assert.deepStrictEqual(await (await fetch(`${base}/api/amazon-picks?market=us`)).json(), []);
  assert.strictEqual((await fetch(`${base}/us/amazon/go/1`, {redirect:"manual"})).status, 410);
  for (const filename of ["components/admin/AdminConsole.tsx", "app/[market]/page.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname,"..",filename),"utf8"), /<AmazonPicks|label: "Amazon picks"/);
  }
  console.log("Amazon picks retired: ok");
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
