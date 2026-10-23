const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const source = file => fs.readFileSync(path.join(root, file), "utf8");

function page({ search = "", stored = false, blocked = false, cookies = true, referrer = "", pathname = "/us" } = {}) {
  const values = new Map(stored ? [["odd_internal_browser", "1"]] : []);
  const nodes = new Map();
  const scripts = [];
  const fetches = [];
  const listeners = {};
  const storage = {
    getItem(key) { if (blocked) throw Error("blocked"); return values.get(key) || null; },
    setItem(key, value) { if (blocked) throw Error("blocked"); values.set(key, String(value)); },
    removeItem(key) { if (blocked) throw Error("blocked"); values.delete(key); },
  };
  const make = () => ({
    dataset: {}, style: {}, handlers: {}, children: [],
    setAttribute() {}, focus() {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
    remove() { nodes.delete(this.id); },
    querySelector: () => null,
  });
  const document = {
    cookie: "", readyState: "complete", referrer, title: "OneDailyDrop",
    documentElement: { lang: "en", dataset: {} }, body: make(),
    head: { appendChild(script) { scripts.push(script.src); } },
    createElement: make, getElementById: id => nodes.get(id), querySelector: () => null,
    addEventListener() {},
  };
  let cookie = "";
  Object.defineProperty(document, "cookie", {
    get() { return cookie; },
    set(value) { if (cookies) cookie = /Max-Age=0(?:;|$)/.test(value) ? "" : value.split(";")[0]; },
  });
  const location = { pathname, search, hash: "", origin: "https://www.onedailydrop.com", protocol: "https:", reloads: 0, reload() { this.reloads++; } };
  const sandbox = {
    URL, URLSearchParams, Event, document, location, localStorage: storage, sessionStorage: storage,
    crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555" },
    navigator: { userAgent: "Mozilla/5.0 Chrome", language: "en-US" }, screen: { width: 1200 },
    history: { replaceState(_state, _title, url) { location.search = new URL(url, location.origin).search; } },
    setTimeout: () => 0,
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    dispatchEvent(event) { for (const handler of listeners[event.type] || []) handler(event); },
    fetch(url) { fetches.push(url); return Promise.resolve({ ok: true }); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(source("public/internal-traffic.js"), context);
  const bootConsent = () => vm.runInContext(source("public/cookie-consent.js"), context);
  return { sandbox, context, values, nodes, scripts, fetches, bootConsent };
}

// A real visitor following a ChatGPT recommendation must still be measured.
const external = page({ referrer: "https://chatgpt.com/", search: "?utm_source=chatgpt.com" });
external.bootConsent();
assert.equal(external.sandbox.oddInternalTraffic.isInternal(), false);
assert.equal(external.scripts.length, 1);
external.sandbox.oddEvent("retailer_click", { item_id: "1" });
assert.ok(external.sandbox.dataLayer.some(row => row[0] === "event"));

for (const options of [
  { search: "?odd_internal=1&utm_source=chatgpt.com" },
  { stored: true },
  { search: "?odd_internal=1", blocked: true },
  { search: "?odd_internal=1", blocked: true, cookies: false },
]) {
  const internal = page(options);
  internal.sandbox.__LAREO_ANALYTICS__ = { endpoint: "https://collector.example", writeKey: "public-test" };
  internal.bootConsent();
  internal.sandbox.oddEvent("view_item", { item_id: "1" });
  assert.equal(internal.sandbox.oddInternalTraffic.isInternal(), true);
  assert.equal(internal.sandbox["ga-disable-G-1L69NBBDV2"], true);
  assert.equal(internal.scripts.length, 0, "internal visitor loaded GA");
  assert.equal(internal.fetches.length, 0, "internal visitor reached Lareo");
  assert.ok(internal.nodes.has("oddInternalTrafficStatus"), "missing visible status");
  assert.ok(!internal.sandbox.location.search.includes("odd_internal"), "opt-out leaked into copied URL");
}

// Existing GA sessions must stop immediately when admin marks the browser.
external.sandbox.oddInternalTraffic.set(true);
const before = external.sandbox.dataLayer.length;
external.sandbox.oddEvent("retailer_click", { item_id: "2" });
assert.equal(external.sandbox.dataLayer.length, before);
assert.equal(external.sandbox["ga-disable-G-1L69NBBDV2"], true);
assert.equal(external.values.get("odd_internal_browser"), "1");

// Explicit opt-in reverses the exclusion, while a normal reload preserves it.
const enabled = page({ stored: true, search: "?odd_internal=0" });
enabled.bootConsent();
assert.equal(enabled.sandbox.oddInternalTraffic.isInternal(), false);
assert.equal(enabled.scripts.length, 1);
assert.equal(enabled.nodes.has("oddInternalTrafficStatus"), false);
const reloaded = page({ stored: true });
reloaded.bootConsent();
assert.equal(reloaded.scripts.length, 0);
const admin = page({ pathname: "/us/admin" });
admin.bootConsent();
assert.equal(admin.scripts.length, 0, "admin page loaded GA before unlocking");

// Both renderers load the preference before any consent/measurement code.
for (const file of ["app/layout.tsx", "src/server.js"]) {
  const code = source(file);
  assert.ok(code.indexOf("/internal-traffic.js") < code.indexOf("/cookie-consent.js"), file);
}

// The shared session helper must honour the same preference in React pages.
const ts = require("typescript");
const compiled = ts.transpileModule(source("lib/analyticsSession.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
reloaded.sandbox.exports = {};
vm.runInContext(compiled, reloaded.context);
assert.equal(reloaded.sandbox.exports.isInternalBrowser(), true);
assert.match(reloaded.sandbox.exports.analyticsSessionId(), /^internal_/);
console.log("Internal browser exclusion checks passed (GA, Lareo, consent, storage fallback, external ChatGPT, React session).");
