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
  let cookie = stored ? "odd_internal_browser=1" : "";
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
  if (stored && !blocked) values.set("odd_analytics_session", "internal_11111111-2222-3333-4444-555555555555");
  vm.runInContext(source("public/internal-traffic.js"), context);
  const bootConsent = () => vm.runInContext(source("public/cookie-consent.js"), context);
  return { sandbox, context, values, nodes, scripts, fetches, bootConsent };
}

// Legacy links and saved preferences must never disable measurement again.
for (const options of [
  {}, { stored: true }, { search: "?odd_internal=1&utm_source=instagram" },
  { stored: true, search: "?odd_internal=1" },
  { stored: true, blocked: true }, { blocked: true, cookies: false, search: "?odd_internal=1" },
  { referrer: "https://chatgpt.com/", search: "?utm_source=chatgpt.com" },
]) {
  const visitor = page(options);
  visitor.bootConsent();
  assert.equal(visitor.scripts.length, 1, "GA must load even for legacy owner browsers/links");
  assert.equal(visitor.sandbox["ga-disable-G-1L69NBBDV2"], false);
  assert.equal(visitor.nodes.size, 0, "owner badge must not return");
  assert.equal(visitor.sandbox.oddInternalTraffic, undefined);
  assert.ok(!visitor.sandbox.location.search.includes("odd_internal"));
  if (options.search?.includes("utm_source")) assert.ok(visitor.sandbox.location.search.includes("utm_source"));
  if (!options.blocked) assert.equal(visitor.values.has("odd_internal_browser"), false);
  if (options.cookies !== false) assert.equal(visitor.sandbox.document.cookie, "");
  visitor.sandbox.oddEvent("retailer_click", { item_id: "1" });
  assert.ok(visitor.sandbox.dataLayer.some(row => row[0] === "event"));
  const ts = require("typescript");
  visitor.sandbox.exports = {};
  vm.runInContext(ts.transpileModule(source("lib/analyticsSession.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, visitor.context);
  assert.ok(!visitor.sandbox.exports.analyticsSessionId().startsWith("internal_"));
}
console.log("Retired owner-mode links and browser flags no longer suppress analytics.");
