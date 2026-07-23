const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const files = ["app.js", "src/config.js", "src/refresh.js", "src/catalogRecovery.js"];

for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  new vm.Script(source, { filename: relative });
}

const refresh = fs.readFileSync(path.join(root, "src/refresh.js"), "utf8");
if (!refresh.includes("Promise.allSettled")) throw new Error("Partial retailer-feed recovery is missing");
if (!refresh.includes("No live retailer API keys are configured")) throw new Error("Live key validation is missing");

const recovery = fs.readFileSync(path.join(root, "src/catalogRecovery.js"), "utf8");
if (!recovery.includes("DELETE FROM products")) throw new Error("Persisted demo cleanup is missing");
if (!recovery.includes("Public production pages must never display")) throw new Error("Production demo purge policy is missing");

const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
if (!app.includes("LOWER(COALESCE(source,''))<>'demo'")) throw new Error("Public live-only catalog filter is missing");
if (!app.includes("affiliateTagConfigured")) throw new Error("Safe production diagnostics are missing");
if (!app.includes("status(503)")) throw new Error("Empty live catalog protection is missing");

const configProbe = `
  const c = require('./src/config');
  process.stdout.write(JSON.stringify({ provider: c.provider, keywords: c.searchKeywords.length }));
`;
const env = {
  ...process.env,
  WEBSITE_SITE_NAME: "production-test",
  PRODUCT_PROVIDER: "demo",
  RAINFOREST_API_KEY: "amazon-key",
  BLUECART_API_KEY: "walmart-key",
  SEARCH_KEYWORDS: ""
};
const result = spawnSync(process.execPath, ["-e", configProbe], { cwd: root, env, encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || "Production config probe failed");
const parsed = JSON.parse(result.stdout);
if (parsed.provider !== "multi") throw new Error(`Azure demo provider was not overridden: ${parsed.provider}`);
if (parsed.keywords < 5) throw new Error("Default production search categories are missing");

console.log("Production catalog recovery validation passed.");
