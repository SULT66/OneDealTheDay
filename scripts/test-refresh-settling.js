/*
 * A refresh must not start on a process that has just booted.
 *
 * 2026-09-09: a deploy finished at 04:34 and GitHub released a scheduled
 * refresh — delayed four and a half hours from its 00:15 slot — at 04:44. It
 * landed on a container ten minutes old, on a plan with one core. The site
 * answered 503 for twenty-five minutes, the refresh died after five, and the
 * release check failed with it.
 *
 * The workflow had a wake-up check and it passed, because /api/status answers
 * in a quarter of a second while page renders are still taking ten. Answering
 * is not being ready. So readiness is decided by the server, from its own
 * uptime, and that is what this file pins down — including the part that is
 * easy to get wrong: being turned away has to be a "wait", not a "no".
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

const port = 18141;
const KEY = "test-admin-key";
process.env.PORT = String(port);
process.env.ADMIN_KEY = KEY;
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-settling-"));
process.env.SUPPORTED_MARKETS = "us";
/* An hour, so a process that is seconds old is unambiguously inside it. */
process.env.REFRESH_SETTLING_SECONDS = "3600";

/* The real entrypoint, not src/server directly: app.js is what Azure starts,
   and it is where /api/status is actually built. A test that loaded the inner
   module would have been testing a route production never serves. */
require("../app.js");

const base = `http://127.0.0.1:${port}`;

(async () => {
  await new Promise(resolve => setTimeout(resolve, 2500));

  /* --- The uptime is published, because from outside there was no way to tell
     a restart from a slow minute, and the difference decides where to look. --- */
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.ok(Number.isFinite(status.uptimeSeconds), "status reports uptimeSeconds");
  assert.ok(status.uptimeSeconds >= 0 && status.uptimeSeconds < 3600);

  /* --- Fresh process: the refresh is postponed, not run. --- */
  const refused = await fetch(`${base}/api/admin/refresh`, {
    method: "POST",
    headers: { "x-admin-key": KEY },
  });
  assert.strictEqual(refused.status, 503, "a refresh on a fresh process is refused");
  const body = await refused.json();
  assert.strictEqual(body.settling, true);
  assert.strictEqual(body.accepted, false);
  /*
   * The distinction that matters. A caller reading this has to understand it
   * should come back, not that the refresh failed — a scheduled job that treats
   * "too early" as an error just gives up for the day and the catalogue goes
   * stale, which is the opposite of what the guard is for.
   */
  assert.ok(body.retry_after_seconds > 0, "it says how long to wait");
  assert.strictEqual(refused.headers.get("retry-after"), String(body.retry_after_seconds));
  assert.match(body.error, /settling/i);
  assert.match(body.error, /\d+s/, "the message carries the number, not just the word");

  /* --- The key still comes first: an unauthenticated caller learns nothing
     about our uptime or our state. --- */
  const unauthorised = await fetch(`${base}/api/admin/refresh`, { method: "POST" });
  assert.strictEqual(unauthorised.status, 401, "the admin key is checked before the guard");

  console.log("refresh settling: ok");
  await new Promise(resolve => setTimeout(resolve, 250));
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
