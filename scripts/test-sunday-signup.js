/*
 * Joining the Sunday list from the site.
 *
 * The digest has always been a separate opt-in, and until now the only way
 * into it was the tokened link in the day-seven welcome letter — which a
 * visitor could not reach without first joining the drop list and waiting a
 * week. The list therefore had no members at all, and the Sunday sweep found
 * nobody to write to every Sunday since it shipped.
 *
 * /api/subscribe now takes `list`, and these checks hold it to the three
 * promises the form makes: a Sunday signup gets the Sunday letter and not the
 * drop alerts, an existing subscriber adding Sundays keeps what they already
 * had, and the confirmation that arrives describes the list they actually
 * chose rather than the other one.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 28000 + process.pid % 10000;
const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  PORT: String(port),
  BACKEND_API_URL: base,
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "odd-sunday-signup-")),
  WEBSITE_SITE_NAME: "sunday-signup-test",
  SUPPORTED_MARKETS: "us,ca,uk,fr,de",
  EBAY_CLIENT_ID: "fixture-client",
  EBAY_CLIENT_SECRET: "fixture-secret",
  EBAY_CAMPAIGN_ID: "5339179772",
  SENDGRID_API_KEY: "SG.local-test-only",
  EMAIL_FROM: "info@onedailydrop.com",
});

const nativeFetch = global.fetch;
const mail = [];
global.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.sendgrid.com") {
    mail.push(JSON.parse(options.body));
    return new Response("", { status: 202 });
  }
  return nativeFetch(input, options);
};

const config = require("../src/config");
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
const db = require("../src/db");
require("../app");

const subscribe = (body) => nativeFetch(`${base}/api/subscribe`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ market: "us", source: "homepage", ...body }),
});

const row = (email) => db
  .prepare("SELECT drop_opt_in, digest_opt_in, signup_list, status FROM subscribers WHERE email=?")
  .get(email);

const lastSubject = () => mail[mail.length - 1]?.subject || "";
const lastHtml = () => mail[mail.length - 1]?.content?.find(part => part.type === "text/html")?.value || "";

/* app.js binds the port asynchronously and Next compiles on the first hit, so
   the first request can arrive before anything is listening. */
async function waitForServer(timeoutMs = 120000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      await nativeFetch(`${base}/api/health`, { method: "GET" });
      return;
    } catch (error) {
      if (Date.now() > until) throw new Error(`the server never came up on ${base}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

(async () => {
  await waitForServer();

  /* ------------------------------------------------ a new address, Sundays */

  assert.equal((await subscribe({ email: "sunday@example.test", list: "sunday" })).status, 201);
  const sunday = row("sunday@example.test");
  assert.equal(sunday.digest_opt_in, 1, "asking for the Sunday list did not put them on it");
  assert.equal(sunday.signup_list, "sunday", "the list they joined at was not recorded");
  /*
   * And nothing else. Turning the drop alerts on as well would answer a
   * question they did not ask, with more mail than they agreed to — which is
   * exactly the complaint that makes a list stop arriving in anyone's inbox.
   */
  assert.equal(sunday.drop_opt_in, 0, "a Sunday signup was also put on the per-drop list");

  assert.match(lastSubject(), /Sunday/i, "the confirmation did not mention the list they chose");
  assert.doesNotMatch(
    lastHtml(),
    /ten minutes/i,
    "the confirmation described the Live Drops to somebody who asked for one email a week",
  );

  /* -------------------------------------------- a new address, the drops */

  assert.equal((await subscribe({ email: "drops@example.test" })).status, 201);
  const drops = row("drops@example.test");
  assert.equal(drops.drop_opt_in, 1, "the drop form stopped putting people on the drop list");
  assert.equal(drops.digest_opt_in, 0, "the drop form put somebody on the Sunday list unasked");
  assert.equal(drops.signup_list, "drops");
  assert.match(lastSubject(), /Live/i, "the drop confirmation changed");

  /* ------------------------- an existing subscriber adding the Sunday list */

  /*
   * Adding a list must not take one away. This is the reader who likes the
   * drops and also wants the weekly letter; losing the alerts here would be a
   * setting they never touched being changed for them.
   */
  assert.equal((await subscribe({ email: "drops@example.test", list: "sunday" })).status, 201);
  const both = row("drops@example.test");
  assert.equal(both.digest_opt_in, 1, "an existing subscriber could not add the Sunday list");
  assert.equal(both.drop_opt_in, 1, "adding the Sunday list turned off the drop alerts they already had");
  assert.equal(both.signup_list, "drops", "an existing subscriber's original list was rewritten");

  /* ------------------------------------------ asking again for the drops */

  /* The reverse, which the route has always promised: asking for the drops
     again undoes an earlier "fewer emails", and leaves the Sunday letter on. */
  db.prepare("UPDATE subscribers SET drop_opt_in=0 WHERE email=?").run("drops@example.test");
  assert.equal((await subscribe({ email: "drops@example.test" })).status, 201);
  const back = row("drops@example.test");
  assert.equal(back.drop_opt_in, 1, "asking for the drops again did not turn them back on");
  assert.equal(back.digest_opt_in, 1, "asking for the drops again took the Sunday letter away");

  /* ------------------------------------------------- an unrecognised list */

  /* An old page still open in somebody's tab sends no `list` at all, and a
     mistyped one must not quietly become a subscription to something else. */
  assert.equal((await subscribe({ email: "odd@example.test", list: "weekly-ish" })).status, 201);
  const odd = row("odd@example.test");
  assert.equal(odd.signup_list, "drops", "an unrecognised list was taken at face value");
  assert.equal(odd.digest_opt_in, 0, "an unrecognised list put somebody on the Sunday list");

  console.log("Sunday signup: separate lists, kept settings, and the right confirmation for each. Passed.");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
