const assert = require("assert");

const { WAITING_ROOM_SECONDS, dropSaving, dropState, presentDrop } = require("../src/liveDrop");

/* A ten minute event that happens once cannot be debugged while it is running,
   so the whole state machine is exercised against a fixed clock here. */
const start = Date.parse("2026-09-10T20:00:00Z");
const drop = {
  drop_key: "drop_2026_09_tech_001",
  market: "us",
  title: "iPhone 17 128GB",
  brand: "Apple",
  retailer_name: "Partner X",
  image_url: "https://example.com/iphone.jpg",
  retail_price: 799,
  drop_price: 449,
  currency: "USD",
  quantity_total: 20,
  quantity_remaining: 20,
  start_at: new Date(start).toISOString(),
  end_at: new Date(start + 10 * 60 * 1000).toISOString(),
  member_early_access_seconds: 60,
  affiliate_url: "https://partner.example.com/buy?sku=123",
  terms: "One per customer.",
};

const at = (offsetSeconds) => start + offsetSeconds * 1000;

// The states, in the order a shopper meets them.
assert.strictEqual(dropState(drop, at(-3600)), "upcoming", "an hour out is not the waiting room");
assert.strictEqual(
  dropState(drop, at(-WAITING_ROOM_SECONDS + 1)),
  "waiting",
  "the waiting room did not open five minutes before the start",
);
assert.strictEqual(dropState(drop, at(-1)), "waiting", "the drop opened a second early");
assert.strictEqual(dropState(drop, at(0)), "live", "the drop did not open on its start");
assert.strictEqual(dropState(drop, at(599)), "live", "the drop closed inside its own window");
assert.strictEqual(dropState(drop, at(600)), "ended", "the drop stayed open past its end");

/* Early access is what a Drop Pass buys. Sixty seconds before the public, and
   not a second before that. */
assert.strictEqual(dropState(drop, at(-61), 60), "waiting", "early access started too early");
assert.strictEqual(dropState(drop, at(-60), 60), "live", "early access did not let a member in");
assert.strictEqual(dropState(drop, at(-60), 0), "waiting", "a free shopper was let in early");

/* Selling out is a different thing to arrive at than running out of time, and
   it is the one worth telling somebody who missed it. */
const soldOut = { ...drop, quantity_remaining: 0 };
assert.strictEqual(dropState(soldOut, at(120)), "sold_out", "a drop with no stock left still reads as live");
assert.strictEqual(
  dropState(soldOut, at(3600)),
  "sold_out",
  "a drop that sold out reads as merely ended once the clock runs out, losing the more useful fact",
);
assert.strictEqual(
  dropState(soldOut, at(-3600)),
  "upcoming",
  "a drop that has not opened yet reads as sold out",
);

/* A drop with no stated quantity is not a sold-out drop. */
assert.strictEqual(
  dropState({ ...drop, quantity_total: 0, quantity_remaining: 0 }, at(60)),
  "live",
  "a drop with no quantity cap was treated as sold out",
);

// Nonsense dates end rather than going live for ever.
assert.strictEqual(dropState({ ...drop, start_at: "" }, at(0)), "ended");
assert.strictEqual(dropState(null, at(0)), "ended");

/*
 * The price is the mechanic. Publishing it in the JSON before the drop opens
 * hands it to anybody who opens developer tools, which is most of the point of
 * a timed reveal gone.
 */
const teaser = presentDrop(drop, at(-600));
assert.strictEqual(teaser.state, "upcoming");
assert.strictEqual(teaser.drop_price, null, "the drop price leaked before the drop opened");
assert.strictEqual(teaser.saving, null, "the saving gave the price away before the drop opened");
assert.strictEqual(teaser.retail_price, 799, "the retail price is public and should be shown");
assert.strictEqual(
  teaser.affiliate_url,
  "",
  "the buy link was live before the drop, which sends shoppers to pay the ordinary price",
);
assert.strictEqual(teaser.seconds_until_start, 600, "the countdown is wrong before the start");

const live = presentDrop(drop, at(120));
assert.strictEqual(live.state, "live");
assert.strictEqual(live.drop_price, 449);
assert.deepStrictEqual(live.saving, { amount: 350, percent: 44 }, "the saving is wrong");
assert.strictEqual(live.affiliate_url, drop.affiliate_url, "there is no way to buy during the drop");
assert.strictEqual(live.seconds_until_end, 480, "the remaining time is wrong");

/* Seconds rather than a target timestamp, so a browser whose clock is minutes
   out still counts the right length of time. */
assert(
  typeof live.server_now === "string" && Number.isFinite(Date.parse(live.server_now)),
  "the response carries no server clock, so the countdown has to trust the browser",
);

/* No honest comparison, no badge. "SAVE $0 (0%)" is worse than nothing, and a
   saving against a retail price nobody can point at is a complaint waiting to
   happen. */
assert.strictEqual(dropSaving({ retail_price: 0, drop_price: 449 }), null);
assert.strictEqual(dropSaving({ retail_price: 449, drop_price: 449 }), null);
assert.strictEqual(dropSaving({ retail_price: 400, drop_price: 449 }), null);
assert.deepStrictEqual(dropSaving({ retail_price: 100, drop_price: 75 }), { amount: 25, percent: 25 });

/*
 * What the host says on arrival, and the one thing she may not say early.
 *
 * The price is the mechanic. A host who reads it out in the waiting room gives
 * away the event as surely as publishing it in the JSON would.
 */
const { hostGreeting } = require("../src/liveDrop");
const waitingGreeting = hostGreeting(presentDrop(drop, at(-120)));
assert(waitingGreeting.includes("iPhone 17"), "the host opens without naming what she is presenting");
assert(
  !waitingGreeting.includes("449"),
  "the host reads the drop price out in the waiting room, giving the reveal away",
);
assert(!/\b44\s?percent\b/.test(waitingGreeting), "the saving gives the price away before the reveal");

const liveGreeting = hostGreeting(presentDrop(drop, at(60)));
assert(liveGreeting.includes("449"), "the host does not say the price once it is live");
assert(liveGreeting.includes("44 percent"), "the host does not say the saving once it is live");
assert(hostGreeting(null).length > 0, "a drop-less greeting throws instead of falling back");

console.log("Live Drop states, early access, price reveal, saving and host greeting checks passed.");

/* ------------------------------------------------------------------ funnel */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dbSource = fs.readFileSync(path.join(__dirname, "..", "src", "db.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const panelSource = fs.readFileSync(
  path.join(__dirname, "..", "components", "live", "LiveDropPanel.tsx"),
  "utf8",
);
const adminSource = fs.readFileSync(
  path.join(__dirname, "..", "components", "admin", "AdminConsole.tsx"),
  "utf8",
);

/* The schema is lifted from db.js rather than retyped, so a change there that
   breaks these guarantees fails here instead of during a drop. */
const eventsTable = /CREATE TABLE IF NOT EXISTS live_drop_events\([\s\S]*?\n  \);/.exec(dbSource);
assert(eventsTable, "live_drop_events is no longer declared where this test looks for it");
const eventsIndex = /CREATE UNIQUE INDEX IF NOT EXISTS idx_live_drop_events_unique[^;]*;/.exec(dbSource);
assert(eventsIndex, "the unique index is gone, so one open tab can count as hundreds of viewers");

const memory = new Database(":memory:");
memory.exec(`CREATE TABLE live_drops(id INTEGER PRIMARY KEY, drop_key TEXT);
  ${eventsTable[0]}
  ${eventsIndex[0]}`);
memory.prepare("INSERT INTO live_drops(id,drop_key) VALUES(1,'drop_test')").run();

const record = (session, type) =>
  memory
    .prepare("INSERT INTO live_drop_events(drop_id,market,event_type,session_id,occurred_at) VALUES(1,'us',?,?,?)")
    .run(type, session, new Date().toISOString());

record("session-aaaaaaaaaaaaaaaa", "waiting_room");
/* A page left open for the whole drop polls every five seconds. Counting each
   poll would report a hundred and twenty people where there is one. */
assert.throws(
  () => record("session-aaaaaaaaaaaaaaaa", "waiting_room"),
  /UNIQUE/,
  "the same session was counted twice in the same stage",
);
/* Moving through the funnel is not a duplicate: the same person waits, then
   sees the reveal, then buys. */
record("session-aaaaaaaaaaaaaaaa", "reveal");
record("session-bbbbbbbbbbbbbbbb", "waiting_room");
assert.strictEqual(
  memory.prepare("SELECT COUNT(*) AS total FROM live_drop_events WHERE event_type='waiting_room'").get().total,
  2,
  "two people in the waiting room were not counted as two",
);

/* Only the five stages, and nothing that identifies anybody. A funnel count
   does not need to know who was there. */
const allowed = /const LIVE_DROP_EVENTS = new Set\(\[([^\]]*)\]\)/.exec(serverSource);
assert(allowed, "the allowed Live Drop events are no longer declared in server.js");
assert.deepStrictEqual(
  allowed[1].match(/"[a-z_]+"/g),
  ['"waiting_room"', '"reveal"', '"host_started"', '"buy_click"', '"remind"'],
  "the Live Drop funnel stages changed",
);
assert(
  !/live_drop_events[\s\S]{0,400}?(email|user_id)/.test(dbSource.slice(dbSource.indexOf("live_drop_events"))),
  "the funnel table now carries something that identifies a person",
);

/* The buy click has to survive the navigation to the retailer, which is the
   one event most worth keeping. */
assert(
  /keepalive: true/.test(fs.readFileSync(path.join(__dirname, "..", "lib", "analyticsSession.ts"), "utf8")),
  "buy clicks are reported without keepalive, so they are lost on navigation",
);
assert(
  /recordLiveDropEvent\(drop\.drop_key, "buy_click"\)/.test(panelSource),
  "the buy button no longer reports a click",
);

/* The price must not reach the browser before the reveal, and the panel must
   not be able to work the state out for itself. */
assert(
  !/dropState|Date\.now\(\)/.test(panelSource.replace(/\/\*[\s\S]*?\*\//g, "")),
  "the panel decides the drop state locally, so a wrong browser clock opens it early",
);

/* The two-week TV MVP must keep the AI presenter and the physical product
   demonstration as separate media surfaces. That is what lets a real product
   appear in human hands without asking a generated avatar to fake the grip. */
assert(
  /function BroadcastStage/.test(panelSource) && /AI host/.test(panelSource) && /Product demo/.test(panelSource),
  "the live page no longer composes the AI host and product demonstration",
);
assert(
  /src=\{drop\.stream_embed_url\}/.test(panelSource) && /src=\{drop\.video_url\}/.test(panelSource),
  "one of the two broadcast media inputs is no longer rendered",
);
/* Named for what each panel shows rather than for the arrangement. A presenter
   cannot hold up a monitor, so one panel is whoever is talking and the other
   is where the product is actually seen. */
assert(
  /Presenter video/.test(adminSource) && /Product footage/.test(adminSource),
  "the operator console no longer explains which live media belongs in each field",
);

console.log("Live Drop funnel, one-row-per-session and reveal-safety checks passed.");

async function main() {
  /* --------------------------------------------------------------- reminders */

  const { REMINDER_LEAD_MINUTES, sendDueReminders } = require("../src/liveDrop");

  const dropsTable = /CREATE TABLE IF NOT EXISTS live_drops\([\s\S]*?\n  \);/.exec(dbSource);
  const remindersTable = /CREATE TABLE IF NOT EXISTS live_drop_reminders\([\s\S]*?\n  \);/.exec(dbSource);
  assert(dropsTable && remindersTable, "the Live Drop tables moved out of db.js");

  const mail = new Database(":memory:");
  mail.exec(`${dropsTable[0]}\n${remindersTable[0]}`);

  const sweepNow = Date.parse("2026-09-10T19:52:00Z");
  const scheduleDrop = (id, key, startsInMinutes, published = 1) =>
    mail.prepare(`INSERT INTO live_drops(id,drop_key,market,title,start_at,end_at,published,created_at,updated_at)
      VALUES(?,?,'us','iPhone 17 128GB',?,?,?,'','')`).run(
      id,
      key,
      new Date(sweepNow + startsInMinutes * 60000).toISOString(),
      new Date(sweepNow + (startsInMinutes + 10) * 60000).toISOString(),
      published,
    );
  const wants = (dropId, email) =>
    mail.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(?,?,'')").run(dropId, email);

  scheduleDrop(1, "opens_soon", 8);          // inside the lead window
  scheduleDrop(2, "opens_much_later", 240);  // hours away
  scheduleDrop(3, "already_started", -30);   // over and done with
  scheduleDrop(4, "unpublished", 8, 0);      // scheduled but not announced

  wants(1, "soon@example.com");
  wants(2, "later@example.com");
  wants(3, "missed@example.com");
  wants(4, "draft@example.com");

  const sentTo = [];
  const collect = async (message) => { sentTo.push(message); };

  let sent = await (sendDueReminders({ db: mail, sendReminder: collect, now: sweepNow }));

  /* Only the drop that is actually about to open. A reminder for a drop four
     hours out is spam; one for a drop that ended half an hour ago sends somebody
     to an empty page; one for a drop nobody has been told about leaks it. */
  assert.strictEqual(sent, 1, "the wrong number of reminders went out");
  assert.deepStrictEqual(sentTo.map((message) => message.email), ["soon@example.com"]);
  assert.strictEqual(sentTo[0].minutes, 8, "the email would state the wrong number of minutes");
  assert.strictEqual(sentTo[0].market, "us", "the reminder links to the wrong market");

  /* Sweeping again a second later must not email the same person twice. */
  sent = await (sendDueReminders({ db: mail, sendReminder: collect, now: sweepNow + 1000 }));
  assert.strictEqual(sent, 0, "the same reminder was sent twice");

  /* A mailer outage leaves the row for the next sweep rather than consuming it,
     and one bad address does not stop the queue behind it. */
  scheduleDrop(5, "outage", 9);
  wants(5, "broken@example.com");
  wants(5, "fine@example.com");
  const refuseFirst = async (message) => {
    if (message.email === "broken@example.com") throw new Error("mailer down");
    sentTo.push(message);
  };
  sent = await (sendDueReminders({
    db: mail,
    sendReminder: refuseFirst,
    now: sweepNow,
    logger: { error() {} },
  }));
  assert.strictEqual(sent, 1, "a failed send stopped the rest of the queue");
  assert.strictEqual(
    mail.prepare("SELECT reminded_at FROM live_drop_reminders WHERE email='broken@example.com'").get().reminded_at,
    null,
    "a reminder that was never sent is marked as sent, so it will never be retried",
  );

  assert.strictEqual(REMINDER_LEAD_MINUTES, 10, "the lead time changed; the waiting room opens at T-05:00");

  console.log("Live Drop reminder window, retry and one-send-per-person checks passed.");

  /* ------------------------------------------------------------------ admin */

  /* Every admin route sits behind the key, the read included. The list hands
     back the drop price before the reveal, which is right for the person who
     set it and would be a leak on any unguarded route. */
  const adminRoutes = serverSource.match(/app\.(?:get|post|delete)\("\/api\/admin\/live-drops[^"]*", *[a-z]+/g) || [];
  assert.strictEqual(adminRoutes.length, 6, "the set of admin Live Drop routes changed");
  for (const route of adminRoutes) {
    assert(/, *admin$/.test(route), `an admin Live Drop route is not behind the key: ${route}`);
  }

  /* Two guards that exist because both rewrite history rather than merely being
     untidy: a drop cannot be pulled out from under whoever is watching it, and
     a drop that ran is the record of what was offered. */
  assert(
    /dropState\(drop, Date\.now\(\)\) === "live"/.test(serverSource),
    "an open drop can now be unpublished from under whoever is watching it",
  );
  assert(
    /drop\.published \|\| Date\.now\(\) >= Date\.parse\(drop\.start_at\)/.test(serverSource),
    "a drop that has run can now be deleted, so the record of what was offered can vanish",
  );

  /* The buy link is the one field that sends a shopper off our site. */
  assert(
    /\^https\?:/.test(serverSource),
    "the buy link is no longer checked for an http scheme",
  );

  /* The console renders every value as text. It is the one page that holds the
     key, and product titles are typed by hand. */
  const adminPage = fs.readFileSync(
    path.join(__dirname, "..", "components", "admin", "AdminConsole.tsx"),
    "utf8",
  );
  assert(
    !/dangerouslySetInnerHTML/.test(adminPage),
    "the admin console writes HTML out of values it was handed",
  );
  /* Until the key has been accepted there is no market list, and a submission
     without one is answered with a complaint about the market rather than
     about the missing key. */
  assert(
    /<fieldset disabled=\{!unlocked/.test(adminPage),
    "the drop form can be submitted before the server has said which markets exist",
  );
  /* The key lives in component state and nowhere that outlives the tab. */
  assert(
    !/localStorage\.|sessionStorage\.|document\.cookie/.test(adminPage),
    "the admin key is now kept in storage, where it outlives whoever typed it",
  );

  /*
   * The way out of a drop goes through the server.
   *
   * "Buy now" was the retailer link printed into the page, so the click was
   * counted only where the browser's analytics survived, and the link stayed
   * good in a tab left open after the drop closed — sending somebody out to
   * buy at whatever the shop charges now, with our drop price still beside it.
   */
  const liveGo = /app\.get\("\/live\/go\/:key"[\s\S]*?\n\}\);/.exec(serverSource);
  assert(liveGo, "the Live Drop redirect is gone, so Buy now is a bare retailer link again");
  assert(
    /dropState\(drop, Date\.now\(\)\) !== "live"/.test(liveGo[0]),
    "the redirect no longer checks the drop is live at the moment of the click",
  );
  assert(
    /INSERT INTO live_drop_events/.test(liveGo[0]),
    "the redirect no longer records the click, so it counts only where analytics runs",
  );
  const panel = fs.readFileSync(
    path.join(__dirname, "..", "components", "live", "LiveDropPanel.tsx"),
    "utf8",
  );
  assert(
    !/href=\{drop\.affiliate_url\}/.test(panel),
    "the panel prints the retailer link straight into the page again",
  );

  /*
   * And a private host is not how a Live Drop reaches an audience. One Tavus
   * conversation is one paid video call per viewer, so a hundred viewers would
   * be a hundred calls and no longer one shared event. The audience is served
   * by stream_embed_url, which BroadcastStage prefers; this ceiling only
   * matches whatever the Tavus plan allows.
   */
  const configSource = fs.readFileSync(path.join(__dirname, "..", "src", "config.js"), "utf8");
  assert(
    /LIVE_HOST_MAX_SESSIONS/.test(configSource),
    "the private-host ceiling is hard-coded again instead of matching the Tavus plan",
  );
  assert(
    !/tavusConversations\.size >= 10/.test(serverSource),
    "the bare 10 is back in the conversation endpoint",
  );
  const stage = /function BroadcastStage\([\s\S]*?\n\}/.exec(panel);
  assert(stage, "BroadcastStage moved out of the Live panel");
  assert(
    stage[0].indexOf("hasHost ?") < stage[0].indexOf("drop.tavus_available ?"),
    "the per-viewer host now outranks the broadcast everyone could watch",
  );

  /*
   * "Asked to be reminded" and "was reminded" are different numbers.
   *
   * A rehearsal signed one person up, the console showed "reminders: 1", and
   * it read as success until no email arrived. Delivery was not configured at
   * all; a failed send leaves reminded_at null, which at a glance is the same
   * as "not due yet", and the sweep only looks at drops that have not started,
   * so after the drop opens the failure has nowhere left to appear.
   */
  assert(
    /COUNT\(reminded_at\) AS sent/.test(serverSource),
    "the console counts reminders asked for without counting the ones that were sent",
  );
  assert(
    /reminders_unsent:/.test(serverSource),
    "an unsent reminder is invisible again",
  );
  assert(
    /email_delivery: process\.env\.SENDGRID_API_KEY/.test(serverSource),
    "the console no longer says whether email can be delivered at all",
  );
  assert(
    /SENDGRID_API_KEY is not set/.test(serverSource),
    "an unconfigured mailer no longer says so at boot, only once a minute into a log nobody reads",
  );

  /*
   * "Watching now" counts presence, not arrivals.
   *
   * The funnel keeps one row per session for the whole drop, so it can say how
   * many turned up and never that anybody left — putting it behind a live
   * viewer count would only ever go up, which is the same lie as a stock
   * counter that cannot go down. Presence is a row that gets overwritten and
   * ages out on its own.
   */
  const presenceTable = /CREATE TABLE IF NOT EXISTS live_drop_presence\([\s\S]*?\n  \);/.exec(dbSource);
  assert(presenceTable, "live_drop_presence is gone, so a viewer count has nothing honest behind it");
  assert(
    /PRIMARY KEY\(drop_id, session_id\)/.test(presenceTable[0]),
    "presence rows accumulate per session again, so one person watching counts as many",
  );
  assert(
    /ON CONFLICT\(drop_id,session_id\) DO UPDATE SET seen_at=excluded\.seen_at/.test(serverSource),
    "a heartbeat inserts instead of refreshing, so leaving never lowers the count",
  );
  assert(
    /seen_at >= \?/.test(serverSource) && /WATCHING_WINDOW_MS = 90 \* 1000/.test(serverSource),
    "the count no longer has a window, so it counts everybody who ever arrived",
  );
  /* Longer than the heartbeat, or a phone that dipped through a tunnel drops
     out of a count it belongs in. */
  const heartbeat = /setInterval\(beat, (\d+)\)/.exec(panel);
  assert(heartbeat, "the presence heartbeat is gone");
  assert(
    Number(heartbeat[1]) < 90 * 1000,
    "the heartbeat is slower than the window it feeds, so watchers flicker in and out",
  );
  assert(
    /onAir && drop\.watching > 0/.test(panel),
    "the viewer count shows outside the drop, or shows a zero nobody needed to read",
  );

  console.log("Live Drop admin guards, server-side exit, broadcast priority, reminders and presence passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
