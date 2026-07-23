const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
for (const relative of ["src/config.js", "src/refresh.js", "src/providers/demo.js"]) {
  const source = fs.readFileSync(path.join(root, relative), "utf8");
  new vm.Script(source, { filename: relative });
}

const env = { ...process.env, WEBSITE_SITE_NAME: "catalog-recovery-test", PRODUCT_PROVIDER: "multi" };
delete env.RAINFOREST_API_KEY;
delete env.BLUECART_API_KEY;
const result = spawnSync(process.execPath, ["-e", "const c=require('./src/config'); process.stdout.write(c.provider)"], {
  cwd: root,
  env,
  encoding: "utf8"
});

if (result.status !== 0) throw new Error(result.stderr || "Unable to load catalog configuration");
if (result.stdout !== "demo") throw new Error(`Expected emergency provider demo, received ${result.stdout}`);

const refresh = fs.readFileSync(path.join(root, "src/refresh.js"), "utf8");
if (!refresh.includes('c.provider !== "demo"')) throw new Error("Emergency catalog recursion guard is missing");
if (!refresh.includes('provider: "demo"')) throw new Error("Emergency catalog fallback is missing");

console.log("Catalog recovery validation passed.");
