const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = ["app.js", "src/config.js", "src/refresh.js", "src/catalogRecovery.js", "src/providers/demo.js"];

for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  new vm.Script(source, { filename: relative });
}

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
if (!app.includes("config.demoMode")) throw new Error("Demo-mode routing guard is missing");
if (!app.includes("config.liveRefreshEnabled")) throw new Error("Live refresh guard is missing");

const configProbe = `
  const c = require('./src/config');
  process.stdout.write(JSON.stringify({
    provider: c.provider,
    siteMode: c.siteMode,
    demoMode: c.demoMode,
    liveRefreshEnabled: c.liveRefreshEnabled,
    keywords: c.searchKeywords.length
  }));
`;

const demoEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  SITE_MODE: "demo",
  PRODUCT_PROVIDER: "multi",
  LIVE_REFRESH_ENABLED: "true",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key",
  SEARCH_KEYWORDS: ""
};
const demoResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: demoEnv, encoding: "utf8" });
if (demoResult.status !== 0) throw new Error(demoResult.stderr || "Demo config probe failed");
const demo = JSON.parse(demoResult.stdout);
if (demo.provider !== "demo" || !demo.demoMode || demo.liveRefreshEnabled) {
  throw new Error(`Demo mode could spend retailer credits: ${demoResult.stdout}`);
}
if (demo.keywords < 5) throw new Error("Default demo categories are missing");

const liveEnv = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  SITE_MODE: "live",
  PRODUCT_PROVIDER: "auto",
  LIVE_REFRESH_ENABLED: "true",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key"
};
const liveResult = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env: liveEnv, encoding: "utf8" });
if (liveResult.status !== 0) throw new Error(liveResult.stderr || "Live config probe failed");
const live = JSON.parse(liveResult.stdout);
if (live.provider !== "multi" || live.demoMode || !live.liveRefreshEnabled) {
  throw new Error(`Live mode activation is invalid: ${liveResult.stdout}`);
}

console.log("Catalog mode validation passed.");
