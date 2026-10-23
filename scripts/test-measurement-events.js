/*
 * The six measurement events: that they can be sent, and that consent decides.
 *
 * GA4 had page views and nothing else, so every question past "how many people
 * came" was unanswerable. The events added for that are only worth having if
 * two things hold, and both are easy to break without noticing:
 *
 *   1. They arrive at all. An event name is a string, a typo is a metric that
 *      silently never appears, and nobody looks at a report that is empty
 *      because they assume the channel is simply quiet.
 *   2. They do not arrive before a European visitor has agreed. `gtag` exists
 *      as a dataLayer stub from the first line of cookie-consent.js, long
 *      before anybody has been asked, so "is gtag a function" is not the same
 *      question as "may we measure this person" — and getting that wrong is
 *      not a bug, it is a breach.
 *
 * So the loader is executed here against a stub DOM rather than read, because
 * the consent gate is control flow and reading it is how you convince yourself
 * that wrong code is right.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const consentSource = read("public/cookie-consent.js");

/* ------------------------------------------------------------------ *
 * Just enough DOM for the loader to run.
 * ------------------------------------------------------------------ */

function makeElement() {
  const handlers = {};
  const found = {};
  const element = {
    handlers,
    id: "",
    className: "",
    innerHTML: "",
    textContent: "",
    type: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    remove() {},
    focus() {},
    addEventListener(type, fn) {
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(fn);
    },
    querySelector(selector) {
      if (!found[selector]) found[selector] = makeElement();
      return found[selector];
    },
    querySelectorAll: () => [],
  };
  return element;
}

/**
 * Run cookie-consent.js in a fake page and hand back the levers.
 *
 * `events` reads back only what was pushed as a gtag event, which is the
 * question every assertion below asks: did this reach Google, or not.
 */
function openPage({ market = "us", saved = null } = {}) {
  const storage = new Map();
  if (saved) storage.set("odd_cookie_consent_v1", saved);

  const body = makeElement();
  const head = makeElement();
  const documentElement = makeElement();
  documentElement.lang = "en-US";

  let banner = null;
  const document = {
    documentElement,
    head,
    body,
    createElement(tag) {
      const element = makeElement();
      /* The consent dialog is the one element the test needs to click. */
      if (tag === "section") banner = element;
      return element;
    },
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {},
  };

  const window = {
    URLSearchParams,
    __ODD_MARKET__: market,
    __ODD_LANGUAGE__: "en",
    document,
    location: { pathname: `/${market}/brands`, search: "", origin: "https://www.onedailydrop.com" },
    /* The Lareo loader retries on a timer when its config is absent, which it
       always is here. Nothing in this test depends on it running. */
    setTimeout: () => 0,
    localStorage: {
      getItem: key => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    navigator: { sendBeacon: () => true, userAgent: "test" },
    crypto: { randomUUID: () => "11111111-2222-3333-4444-555555555555", getRandomValues: array => array },
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  };
  window.window = window;
  window.self = window;
  window.globalThis = window;

  const context = vm.createContext(window);
  context.document = document;
  context.location = window.location;
  context.localStorage = window.localStorage;
  context.navigator = window.navigator;
  context.setTimeout = window.setTimeout;
  vm.runInContext(consentSource, context, { filename: "cookie-consent.js" });

  const press = selector => {
    assert.ok(banner, "the consent banner was never built, so it cannot be answered");
    const clicks = banner.querySelector(selector).handlers.click || [];
    assert.strictEqual(clicks.length, 1, `nothing is listening for a click on ${selector}`);
    clicks[0]();
  };

  return {
    emit: (name, values) => window.oddEvent?.(name, values),
    hasEmitter: () => typeof window.oddEvent === "function",
    /* Built with a plain loop on purpose. dataLayer belongs to the sandbox, so
       anything `.map` returns there carries the sandbox's own Array prototype
       and assert.deepStrictEqual rejects it against an array from this file —
       with the two printed side by side looking identical. */
    events: () => {
      const out = [];
      for (const entry of window.dataLayer || []) {
        if (entry[0] !== "event") continue;
        out.push({ name: String(entry[1]), parameters: entry[2] });
      }
      return out;
    },
    accept: () => press("[data-cookie-accept]"),
    decline: () => press("[data-cookie-decline]"),
  };
}

/* ------------------------------------------------------------------ *
 * A market with no consent requirement reports straight away.
 * ------------------------------------------------------------------ */

const us = openPage({ market: "us" });
assert.ok(us.hasEmitter(), "no page can report anything: window.oddEvent was never defined");

us.emit("view_item", { item_id: "497254", item_category: "Tools", retailer: "ebay" });
us.emit("retailer_click", { item_id: "497254", placement: "product_cta" });
assert.deepStrictEqual(
  us.events().map(event => event.name),
  ["view_item", "retailer_click"],
  "events are not reaching GA4 on a market that needs no consent banner",
);
assert.strictEqual(
  us.events()[0].parameters.item_id,
  "497254",
  "the event arrived without the listing it was about",
);

/* An unknown name is a typo, and a typo must not become a metric. */
us.emit("view_items", { item_id: "1" });
us.emit("purchase", { value: 99 });
assert.deepStrictEqual(
  us.events().map(event => event.name),
  ["view_item", "retailer_click"],
  "an event name outside the agreed six was forwarded to GA4",
);

/* Objects cannot be sent: GA4 would receive the string "[object Object]". */
us.emit("search", { search_term: "lego", result_count: 12, filter: { brand: "lego" }, missing: null });
const search = us.events().find(event => event.name === "search");
assert.deepStrictEqual(
  Object.keys(search.parameters).sort(),
  ["result_count", "search_term"],
  "a parameter that GA4 cannot represent was sent anyway",
);

/* ------------------------------------------------------------------ *
 * Europe: nothing before the answer, and nothing at all after a refusal.
 * ------------------------------------------------------------------ */

const beforeAnswering = openPage({ market: "de" });
beforeAnswering.emit("view_item", { item_id: "497254" });
beforeAnswering.emit("search", { search_term: "lego", result_count: 3 });
assert.deepStrictEqual(
  beforeAnswering.events(),
  [],
  "a German visitor was measured before the consent banner had been answered",
);

const accepted = openPage({ market: "de" });
accepted.emit("view_item", { item_id: "497254" });
assert.deepStrictEqual(accepted.events(), [], "measured before consent was given");
accepted.accept();
assert.deepStrictEqual(
  accepted.events().map(event => event.name),
  ["view_item"],
  "the event held while the banner was open was dropped instead of sent on acceptance",
);

const refused = openPage({ market: "de" });
refused.emit("view_item", { item_id: "497254" });
refused.decline();
assert.deepStrictEqual(refused.events(), [], "events held during the banner were sent after a refusal");
refused.emit("retailer_click", { item_id: "497254" });
assert.deepStrictEqual(refused.events(), [], "a refusal did not stop later events");

/* A visitor who refused on a previous page is not asked again, and not
   measured either. */
const refusedEarlier = openPage({ market: "de", saved: "declined" });
refusedEarlier.emit("view_item", { item_id: "497254" });
assert.deepStrictEqual(
  refusedEarlier.events(),
  [],
  "a stored refusal was ignored on the next page load",
);

/* ------------------------------------------------------------------ *
 * Each of the six is actually fired by something.
 * ------------------------------------------------------------------ */

const callers = {
  view_item: ["components/site/MeasuredPage.tsx"],
  search: ["components/site/MeasuredPage.tsx", "public/click-tracking.js"],
  delia_open: ["components/delia/DeliaContext.tsx"],
  delia_query_submit: ["components/delia/DeliaPanel.tsx"],
  email_signup: ["components/site/LiveDropSignup.tsx"],
  retailer_click: ["components/site/ClickAttribution.tsx", "public/click-tracking.js"],
};

for (const [event, files] of Object.entries(callers)) {
  for (const file of files) {
    assert.ok(
      read(file).includes(`"${event}"`),
      `${file} no longer reports ${event}, so that metric has gone quiet without anything failing`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * What must never be sent.
 * ------------------------------------------------------------------ */

/* The question somebody typed into the assistant. `transcript` is the variable
   holding it; if it ever appears inside the event call, it is leaving. */
const deliaCall = read("components/delia/DeliaPanel.tsx")
  .match(/measure\("delia_query_submit",[\s\S]{0,320}?\}\);/);
assert.ok(deliaCall, "the delia_query_submit call could not be found to check what it sends");
assert.ok(
  !/transcript(?!\.trim\(\)\.length)/.test(deliaCall[0]),
  "the text somebody typed into the assistant is being sent to GA4",
);

const signupCall = read("components/site/LiveDropSignup.tsx")
  .match(/measure\("email_signup",[\s\S]{0,240}?\}\);/);
assert.ok(signupCall, "the email_signup call could not be found to check what it sends");
assert.ok(!/\bemail\b/.test(signupCall[0]), "a subscriber's email address is being sent to GA4");

/* Contact details pasted into a search box do not travel. The rule lives in
   two places because one is a TypeScript module and the other is a plain
   script; both are checked so neither can quietly lose it. */
for (const file of ["lib/measure.ts", "public/click-tracking.js"]) {
  assert.ok(
    /\[\^\\s@\]\+@\[\^\\s@\]\+/.test(read(file)),
    `${file} no longer strips contact details out of a search term`,
  );
}

/* ------------------------------------------------------------------ *
 * The pages Express still renders are measured too.
 * ------------------------------------------------------------------ */

const server = read("src/server.js");
const consentTag = server.indexOf("/cookie-consent.js");
const trackingTag = server.indexOf("/click-tracking.js");
assert.ok(
  consentTag !== -1,
  "the pages Express renders — /:market/brands among them — load no analytics at all",
);
assert.ok(
  consentTag < trackingTag,
  "click-tracking.js loads before cookie-consent.js, so window.oddEvent does not exist "
    + "when the search event fires on page load",
);
assert.ok(
  server.includes("/cookie-consent.css"),
  "the consent banner is loaded without its stylesheet, so European visitors see it unstyled",
);

console.log("Measurement event checks passed.");
