/**
 * The site went down on 2026-08-20 because a rejected promise nobody caught
 * terminates the process, and because the database used WAL on Azure's network
 * share where WAL cannot work. Both are configuration-shaped mistakes that
 * look harmless in review, so they are asserted here rather than remembered.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "src", "db.js"), "utf8");

assert(
  /process\.on\(\s*["']unhandledRejection["']/.test(appSource),
  "An unhandled promise rejection would terminate the process and take every page down with it"
);
assert(
  !/process\.exit/.test(appSource.split('unhandledRejection')[1].split('process.on("uncaughtException"')[0]),
  "The unhandledRejection handler must not exit — that is the crash it exists to prevent"
);
assert(
  /app\.use\(\(error, req, res, next\)/.test(serverSource),
  "Express has no error handler, so a failing route answers with a raw stack trace"
);
/* The rule was never "not WAL on Azure", it was "not WAL on the network
   share". Azure now runs the live database on the container's own disk, where
   WAL is both correct and faster, so the check follows the file rather than
   the platform. Pinned to isAzure it would forbid the very mode that stopped
   the corruption. */
assert(
  /SQLITE_JOURNAL_MODE/.test(dbSource) && /onNetworkShare \? "DELETE"/.test(dbSource),
  "SQLite must not run in WAL mode while the database file sits on the SMB share, where WAL corrupts it"
);
assert(
  /prepareRuntimeDatabase\(/.test(dbSource) && /startSnapshotSchedule\(/.test(dbSource),
  "The live database is back on the network share that corrupted it twice, with no snapshots to restore from"
);
assert(/busy_timeout/.test(dbSource), "Without a busy timeout a contended write throws instead of waiting");
assert(
  dbSource.includes("repairIndexesIfNeeded(db, dbPath, { enabled: isAzure })"),
  "Azure startup does not repair known index-only SQLite corruption before migrations",
);

console.log("Crash resilience and SQLite storage constraints passed.");
