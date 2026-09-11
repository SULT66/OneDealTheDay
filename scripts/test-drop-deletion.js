/*
 * When a Live Drop may be deleted.
 *
 * The rule used to refuse anything whose start time had passed, which reads as
 * "a drop that ran is the record of what was offered" and is not that
 * statement. A draft that was never published never ran — nobody was told, and
 * no public page ever existed for it. Its scheduled hour arriving only meant
 * it could no longer be deleted, so a console filled with dead test drafts had
 * no way out and they went on polluting the funnel counts.
 *
 * The line is whether it was ever published, not the clock and not where it
 * stands now. Loosening it to published-right-now was my first attempt and it
 * was wrong: unpublish a drop that had already run and the record of what was
 * offered to real people could be erased. All three halves are pinned here —
 * a stale draft has to go, a live one has to survive a stray click, and one
 * that was ever public has to survive even after being taken down.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

class TestDatabase {
  constructor(filename) { this.database = new DatabaseSync(filename); }
  pragma(value) { this.database.exec(`PRAGMA ${value}`); }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all:(...params) => statement.all(...params),
      get:(...params) => statement.get(...params),
      run:(...params) => statement.run(...params)
    };
  }
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

const port = 18151;
const KEY = "test-admin-key";
process.env.PORT = String(port);
process.env.ADMIN_KEY = KEY;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-delete-"));
process.env.SUPPORTED_MARKETS = "us";
process.env.REFRESH_SETTLING_SECONDS = "0";

const db = require("../src/db");
require("../app.js");

const base = `http://127.0.0.1:${port}`;
const admin = { "Content-Type": "application/json", "X-Admin-Key": KEY };

const create = async (title, startAt) => {
  const response = await fetch(`${base}/api/admin/live-drops`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({
      title, market: "us", quantity_total: "5", start_at: startAt,
      duration_minutes: "10", currency: "USD", drop_price: "9.99",
    }),
  });
  const body = await response.json();
  assert.strictEqual(response.status, 201, `could not create ${title}: ${JSON.stringify(body)}`);
  return body.drop_key;
};

const publish = (key, published) =>
  fetch(`${base}/api/admin/live-drops/${key}/publish`, {
    method: "POST", headers: admin, body: JSON.stringify({ published }),
  });

const remove = (key) => fetch(`${base}/api/admin/live-drops/${key}`, { method: "DELETE", headers: admin });

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

(async () => {
  await new Promise(resolve => setTimeout(resolve, 2500));

  /* --- A draft whose hour has passed. The case that was stuck: never
     published, so nobody ever saw it, and it must not be immortal. --- */
  const stale = await create("Old test draft", iso(-6 * 24 * 3600 * 1000));
  const staleGone = await remove(stale);
  assert.strictEqual(staleGone.status, 200, "a never-published draft is deletable however old");
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM live_drops WHERE drop_key=?").get(stale).n, 0);

  /* --- A published drop is on the site, and a stray click must not take it
     out from under the people looking at it. --- */
  const livePublished = await create("Published one", iso(3 * 3600 * 1000));
  await publish(livePublished, true);
  const refused = await remove(livePublished);
  assert.strictEqual(refused.status, 409);
  const refusal = await refused.json();
  /* The message has to name the way forward, not merely say no. */
  assert.match(refusal.error, /unpublish/i, "it says what to do instead");
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM live_drops WHERE drop_key=?").get(livePublished).n, 1);

  /* --- And unpublishing does not make it deletable either.
     This is where I first got the rule wrong: loosening the guard to
     published-right-now would have let a drop that already ran be unpublished
     and then erased, taking the record of what was offered to real people with
     it. An existing test caught that; this pins it down from the outside. --- */
  await publish(livePublished, false);
  const stillRefused = await remove(livePublished);
  assert.strictEqual(stillRefused.status, 409, "a drop that was ever published is never deletable");
  assert.match((await stillRefused.json()).error, /record/i);
  assert.strictEqual(db.prepare("SELECT COUNT(*) n FROM live_drops WHERE drop_key=?").get(livePublished).n, 1);

  /* --- Everything hanging off it goes too. A drop deleted while its events,
     reminders or announcements stayed behind would leave rows pointing at a
     drop that no longer exists, and those rows are what the numbers panel
     counts. --- */
  /* Never published: it is a draft that was clicked through locally, which is
     the case that must still clean up after itself. */
  const withHistory = await create("Had visitors", iso(2 * 3600 * 1000));
  const row = db.prepare("SELECT id FROM live_drops WHERE drop_key=?").get(withHistory);
  db.prepare("INSERT INTO live_drop_events(drop_id,market,event_type,session_id,occurred_at) VALUES(?,?,?,?,?)")
    .run(row.id, "us", "reveal", "session-a", new Date().toISOString());
  db.prepare("INSERT INTO live_drop_reminders(drop_id,email,created_at) VALUES(?,?,?)")
    .run(row.id, "someone@example.com", new Date().toISOString());
  db.prepare("INSERT INTO live_drop_presence(drop_id,session_id,seen_at) VALUES(?,?,?)")
    .run(row.id, "session-a", new Date().toISOString());
  db.prepare("INSERT INTO live_drop_announcements(drop_id,subscriber_id,sent_at) VALUES(?,?,?)")
    .run(row.id, 1, new Date().toISOString());

  assert.strictEqual((await remove(withHistory)).status, 200);
  for (const table of ["live_drop_events", "live_drop_reminders", "live_drop_presence", "live_drop_announcements"]) {
    const left = db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE drop_id=?`).get(row.id).n;
    assert.strictEqual(left, 0, `${table} still points at a deleted drop`);
  }

  /* --- The key is still the gate. --- */
  const unauthorised = await fetch(`${base}/api/admin/live-drops/anything`, { method: "DELETE" });
  assert.strictEqual(unauthorised.status, 401);

  console.log("drop deletion: ok");
  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
