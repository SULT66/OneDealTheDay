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
assert(/productLimit=scripted\?1:2/.test(consoleSource),
  "the admin must select one scripted product or two live products");
assert(/product_ids:selected,script,scheduled_at:/.test(consoleSource),
  "the admin must submit the edited script and start time");
assert(/duration_minutes:totalMinutes/.test(consoleSource) && !/id: "drops", label: "Live Drops"/.test(admin),
  "the ODD Live TV admin must submit the show duration and own the broadcast controls");
assert(server.includes('app.post("/api/admin/odd-tv/script",admin,'),
  "script generation must require the admin key");
assert(!packageJson.dependencies?.["@daily-co/daily-js"],
  "the old hosted-video client dependency remains installed");
assert(!/\/api\/admin\/live-host|\/api\/admin\/live-drops\/[^\s]*\/script/.test(server),
  "legacy presenter or presenter-script admin routes remain");

console.log("Live Drop stays separate; ODD Live TV submits its script and schedule through admin.");
