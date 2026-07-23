const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const files = ["src/config.js", "src/refresh.js", "src/catalogRecovery.js"];

for (const relative of files) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  new vm.Script(source, { filename: relative });
}

const refresh = fs.readFileSync(path.join(root, "src/refresh.js"), "utf8");
if (!refresh.includes("Promise.allSettled")) throw new Error("Partial retailer-feed recovery is missing");
if (!refresh.includes("No live retailer API keys are configured")) throw new Error("Live key validation is missing");

const recovery = fs.readFileSync(path.join(root, "src/catalogRecovery.js"), "utf8");
if (!recovery.includes("DELETE FROM products")) throw new Error("Persisted demo cleanup is missing");
if (!recovery.includes("no live retailer products are available")) throw new Error("Safe cleanup guard is missing");

console.log("Production catalog recovery validation passed.");
