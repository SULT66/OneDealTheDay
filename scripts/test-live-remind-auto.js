/*
 * Arranging a reminder for somebody who did not press anything.
 *
 * Almost nobody presses Remind me, so the people most likely to come back —
 * the ones who opened the page early — left with nothing arranged. Opening
 * the page now asks the server what it can do for this visitor.
 *
 * The whole of the care is in what it refuses. An address is needed before
 * anything can be promised and a visitor has not given one; and an account is
 * not permission to be emailed about drops, which is why the welcome letter
 * asks separately. Putting an address on a list because its owner looked at a
 * page is how a list stops arriving in anybody's inbox, so these checks exist
 * mostly to prove that does not happen.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 28400 + process.pid % 500;
const base = `http://127.0.0.1:${port}`;
Object.assign(process.env, {
  PORT: String(port),
  BACKEND_API_URL: base,
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "odd-remind-auto-")),
  WEBSITE_SITE_NAME: "remind-auto-test",
  SUPPORTED_MARKETS: "us,ca,uk,fr,de",
  EBAY_CLIENT_ID: "fixture-client",
  EBAY_CLIENT_SECRET: "fixture-secret",
  EBAY_CAMPAIGN_ID: "5339179772",
  SENDGRID_API_KEY: "SG.local-test-only",
  EMAIL_FROM: "info@onedailydrop.com",
});

const nativeFetch = global.fetch;
global.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.sendgrid.com") return new Response("", { status: 202 });
  return nativeFetch(input, options);
};

const config = require("../src/config");
config.liveRefreshEnabled = false;
config.offerCheckEnabled = false;
const db = require("../src/db");
require("../app");

const iso = (ms) => new Date(ms).toISOString();
const soon = Date.now() + 3 * 3600 * 1000;

db.prepare(`INSERT INTO live_drops(drop_key,market,title,currency,quantity_total,quantity_remaining,
   start_at,end_at,affiliate_url,published,created_at,updated_at)
   VALUES('drop_auto_1','us','Fixture Drop','USD',10,10,?,?,'https://www.ebay.com/itm/123456789012',1,?,?)`)
  .run(iso(soon), iso(soon + 600000), iso(Date.now()), iso(Date.now()));

/* A drop that has already started takes no more reminders. */
db.prepare(`INSERT INTO live_drops(drop_key,market,title,currency,quantity_total,quantity_remaining,
   start_at,end_at,affiliate_url,published,created_at,updated_at)
   VALUES('drop_auto_past','us','Already Started','USD',10,10,?,?,'https://www.ebay.com/itm/123456789012',1,?,?)`)
  .run(iso(Date.now() - 60000), iso(Date.now() + 300000), iso(Date.now()), iso(Date.now()));

const auto = (dropKey, cookie) => nativeFetch(`${base}/api/live/remind/auto`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify({ drop_key: dropKey }),
});

const remindersFor = (email) => db
  .prepare("SELECT COUNT(*) AS n FROM live_drop_reminders WHERE lower(email)=?")
  .get(email).n;

async function signUp(email) {
  const response = await nativeFetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Fixture Person", email, password: "Fixture-Passphrase-9!" }),
  });
  assert.equal(response.status, 201, `could not create the fixture account ${email}`);
  return response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

(async () => {
  for (let i = 0; ; i += 1) {
    try { await nativeFetch(`${base}/api/health`); break; } catch (error) {
      if (i > 600) throw new Error(`the server never came up: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  /* ------------------------------------------------ nobody is signed in */

  /*
   * A visitor has given no address, so there is nothing to arrange and
   * nothing to prefill. The page falls back to the form it always had.
   */
  const anonymous = await (await auto("drop_auto_1")).json();
  assert.deepEqual(anonymous, { armed: false, email: null }, "a signed-out visitor was offered something");

  /* ------------------------- signed in, but not on the drop email list */

  /*
   * The case this endpoint exists to get right. An account is not consent to
   * be emailed about drops — the welcome letter asks for that separately — so
   * the address comes back for the page to offer in one tap, and nothing is
   * written down.
   */
  const strangerCookie = await signUp("stranger@example.test");
  const stranger = await (await auto("drop_auto_1", strangerCookie)).json();
  assert.equal(stranger.armed, false, "an account was treated as permission to email about drops");
  assert.equal(stranger.email, "stranger@example.test", "the address was not offered for a one-tap signup");
  assert.equal(remindersFor("stranger@example.test"), 0, "somebody was signed up for email for looking at a page");

  /* ------------------------------ signed in and already on the drop list */

  /*
   * Permission already exists, so arranging the reminder adds no new consent:
   * it only makes sure they get the email they have already agreed to, for
   * the one event that lasts ten minutes.
   */
  const readerCookie = await signUp("reader@example.test");
  db.prepare(`INSERT INTO subscribers(email,status,source,market,unsubscribe_token,drop_opt_in,created_at,updated_at)
              VALUES('reader@example.test','active','homepage','us','tok-reader-0123456789',1,?,?)`)
    .run(iso(Date.now()), iso(Date.now()));

  const reader = await (await auto("drop_auto_1", readerCookie)).json();
  assert.equal(reader.armed, true, "somebody already on the drop list was not armed");
  assert.equal(remindersFor("reader@example.test"), 1, "the reminder was reported as arranged but not recorded");

  /* Looking twice is one person wanting one reminder. */
  await auto("drop_auto_1", readerCookie);
  assert.equal(remindersFor("reader@example.test"), 1, "a second page view made a second reminder");

  /* ------------------------------------------------------------ undoing it */

  /*
   * What makes arranging it on somebody's behalf acceptable at all. If this
   * stops working, the arming above should stop with it.
   */
  const undone = await nativeFetch(`${base}/api/live/remind`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: readerCookie },
    body: JSON.stringify({ drop_key: "drop_auto_1" }),
  });
  assert.equal(undone.status, 200, "the undo did not work");
  assert.equal(remindersFor("reader@example.test"), 0, "the reminder survived being cancelled");

  /* And a signed-out caller cannot cancel somebody else's. */
  const notMine = await nativeFetch(`${base}/api/live/remind`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ drop_key: "drop_auto_1" }),
  });
  assert.equal(notMine.status, 400, "a caller with no address of their own was allowed to cancel");

  /* ------------------------------------------------- a drop already running */

  /* There is no point promising a warning for something that has started. */
  const late = await (await auto("drop_auto_past", readerCookie)).json();
  assert.equal(late.armed, false, "a reminder was arranged for a drop that had already started");
  assert.equal(late.email, null, "a started drop still offered a one-tap signup");

  /* And an unpublished or unknown drop is simply not there. */
  const nowhere = await (await auto("drop_that_does_not_exist", readerCookie)).json();
  assert.equal(nowhere.armed, false, "a reminder was arranged for a drop that does not exist");

  console.log("live reminder auto-arm: offered, not imposed; recorded once; cancellable.");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
