// This entry point deliberately loads only Node built-ins from Azure's share.
// The complete immutable release (including .next and dependencies) runs locally.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function prepareRuntime(packageDir, temporaryRoot = os.tmpdir()) {
  const archive = path.join(packageDir, "runtime.tar.gz");
  const digest = crypto.createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  const releases = path.join(temporaryRoot, "onedailydrop-releases");
  const destination = path.join(releases, digest);
  const marker = path.join(destination, ".runtime-ready");
  if (fs.existsSync(marker)) return destination;
  fs.mkdirSync(releases, { recursive: true });
  const staging = fs.mkdtempSync(path.join(releases, ".extract-"));
  try {
    execFileSync("tar", ["-xzf", archive, "-C", staging], { stdio: "inherit", timeout: 120000 });
    if (!fs.existsSync(path.join(staging, "app.js"))) throw new Error("Release entry point is missing");
    fs.writeFileSync(path.join(staging, ".runtime-ready"), digest);
    try { fs.renameSync(staging, destination); }
    catch (error) { if (!fs.existsSync(marker)) throw error; }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  return destination;
}

if (require.main === module) {
  const started = Date.now();
  const runtime = prepareRuntime(__dirname);
  console.log(`[startup] local release ready after ${Date.now() - started}ms`);
  process.chdir(runtime);
  require(path.join(runtime, "app.js"));
}
module.exports = { prepareRuntime };
