// Keep the product Live Drop page separate from the self-hosted ODD Live TV system.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const panel = read("components/live/LiveDropPanel.tsx");
const admin = read("components/admin/AdminConsole.tsx");
const consoleSource = read("components/admin/ODDTVConsole.tsx");
const server = read("src/server.js");
const packageJson = JSON.parse(read("package.json"));

assert(!/LiveBroadcast|TavusHost|\/api\/live\/host/.test(panel),
  "the Live Drop page still loads the old hosted-presenter flow");
assert(/ODDTVConsole/.test(admin),
  "the admin does not expose the self-hosted ODD Live TV console");
assert(/Choose exactly 2 products/.test(consoleSource),
  "the two-product pilot is not enforced in the admin");
assert(/scripts:selected\.map\(id=>scripts\[id\]||""\)/.test(consoleSource),
  "the product talking points are not sent with the show");
assert(/30\/30 pilot/.test(consoleSource),
  "the admin does not identify the two 30-minute product blocks");
assert(!packageJson.dependencies?.["@daily-co/daily-js"],
  "the old hosted-video client dependency remains installed");
assert(!/\/api\/admin\/live-host|\/api\/admin\/live-drops\/[^\s]*\/script/.test(server),
  "legacy presenter or presenter-script admin routes remain");

console.log("Live Drop stays separate; ODD Live TV admin requires two products and sends their notes.");
