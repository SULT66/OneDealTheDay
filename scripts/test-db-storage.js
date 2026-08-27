const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");

const {
  bestAvailableCopy,
  isHealthyDatabase,
  listSnapshots,
  prepareRuntimeDatabase,
  snapshotOnPersonalWrites,
  startSnapshotSchedule,
  snapshotDir,
  writeSnapshot,
} = require("../src/dbStorage");

const openDatabase = (file, options) => new Database(file, options);
const quiet = { warn() {}, log() {} };

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-storage-"));
const sharedDir = path.join(workspace, "shared");
const runtimeDir = path.join(workspace, "runtime");
fs.mkdirSync(sharedDir, { recursive: true });
fs.mkdirSync(runtimeDir, { recursive: true });

/** A small but real database, so integrity checks have something to check. */
function seedDatabase(file, rows) {
  const db = new Database(file);
  db.exec("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, body TEXT)");
  const insert = db.prepare("INSERT INTO notes(body) VALUES (?)");
  for (let index = 0; index < rows; index += 1) insert.run(`row ${index}`);
  return db;
}

function countRows(file) {
  const db = new Database(file, { readonly: true });
  try {
    return db.prepare("SELECT COUNT(*) AS total FROM notes").get().total;
  } finally {
    db.close();
  }
}

/* Overwrites the middle of the file with rubbish. Truncating instead would
   only produce a short file, which SQLite reports cleanly; scribbling over a
   live page is what the network share actually did to production. */
function corrupt(file) {
  const handle = fs.openSync(file, "r+");
  try {
    const size = fs.fstatSync(handle).size;
    fs.writeSync(handle, Buffer.alloc(2048, 0x7f), 0, 2048, Math.floor(size / 2));
  } finally {
    fs.closeSync(handle);
  }
}

const live = path.join(runtimeDir, "site.db");
const liveDb = seedDatabase(live, 40);

// A snapshot is a complete, healthy copy of the database it was taken from.
const first = writeSnapshot(liveDb, sharedDir, { keep: 3, logger: quiet, now: new Date("2026-08-26T10:00:00Z") });
assert(fs.existsSync(first), "writeSnapshot did not produce a file");
assert(isHealthyDatabase(first, openDatabase), "a fresh snapshot must pass its own integrity check");
assert.strictEqual(countRows(first), 40, "the snapshot lost rows the live database had");

// Snapshots taken later are newer, and only `keep` of them survive.
liveDb.prepare("INSERT INTO notes(body) VALUES (?)").run("after the first snapshot");
const second = writeSnapshot(liveDb, sharedDir, { keep: 3, logger: quiet, now: new Date("2026-08-26T10:10:00Z") });
const third = writeSnapshot(liveDb, sharedDir, { keep: 3, logger: quiet, now: new Date("2026-08-26T10:20:00Z") });
const fourth = writeSnapshot(liveDb, sharedDir, { keep: 3, logger: quiet, now: new Date("2026-08-26T10:30:00Z") });
assert.strictEqual(countRows(second), 41, "a later snapshot did not include a later write");
const kept = listSnapshots(sharedDir);
assert.strictEqual(kept.length, 3, `expected 3 snapshots to be kept, found ${kept.length}`);
assert.strictEqual(kept[0], fourth, "listSnapshots must return the newest snapshot first");
assert(!fs.existsSync(first), "pruning did not remove the oldest snapshot");
assert(fs.existsSync(third), "pruning removed a snapshot that was still within the keep window");

/* A snapshot interrupted halfway is left under a .partial name. Restoring one
   would hand the site a truncated database, so it must never be listed. */
fs.writeFileSync(path.join(snapshotDir(sharedDir), "site-20260826T104000Z.db.partial"), "not a database");
assert.strictEqual(
  listSnapshots(sharedDir).length,
  3,
  "an interrupted snapshot was treated as a usable one",
);

liveDb.close();

// A healthy runtime copy is left exactly where it is: no restore, no data lost.
const untouched = prepareRuntimeDatabase({
  runtimePath: live,
  sharedPath: path.join(sharedDir, "site.db"),
  sharedDir,
  openDatabase,
  logger: quiet,
});
assert.strictEqual(untouched.restoredFrom, null, "a healthy runtime database must not be overwritten");
assert.strictEqual(countRows(live), 41, "the runtime database changed when nothing needed restoring");

// A container that came up with no local copy restores the newest snapshot.
fs.rmSync(live, { force: true });
const restored = prepareRuntimeDatabase({
  runtimePath: live,
  sharedPath: path.join(sharedDir, "site.db"),
  sharedDir,
  openDatabase,
  logger: quiet,
});
assert.strictEqual(restored.restoredFrom, fourth, "a fresh container did not restore the newest snapshot");
assert.strictEqual(countRows(live), 41, "the restored database is missing rows");

/* The failure that started all this: the newest copy is the corrupt one.
   Restoring it would only move the outage forward by one restart, so the
   newest *healthy* copy has to win instead. */
fs.rmSync(live, { force: true });
corrupt(fourth);
assert(!isHealthyDatabase(fourth, openDatabase), "a scribbled-on database was reported healthy");
const skipped = bestAvailableCopy({
  runtimePath: live,
  sharedPath: path.join(sharedDir, "site.db"),
  sharedDir,
  openDatabase,
});
assert.strictEqual(skipped, third, "a corrupt snapshot was chosen over an older healthy one");

const afterCorruption = prepareRuntimeDatabase({
  runtimePath: live,
  sharedPath: path.join(sharedDir, "site.db"),
  sharedDir,
  openDatabase,
  logger: quiet,
});
assert.strictEqual(afterCorruption.restoredFrom, third, "the restore did not skip the corrupt snapshot");
assert.strictEqual(countRows(live), 41, "the fallback restore is missing rows");

/* A journal beside the old file describes offsets in that file. Carrying one
   into the restored copy would corrupt it, so the restore must clear them. */
fs.rmSync(live, { force: true });
fs.writeFileSync(`${live}-wal`, "stale journal from a previous container");
prepareRuntimeDatabase({
  runtimePath: live,
  sharedPath: path.join(sharedDir, "site.db"),
  sharedDir,
  openDatabase,
  logger: quiet,
});
assert(!fs.existsSync(`${live}-wal`), "a stale journal survived the restore");

// Nothing to restore is survivable: the caller creates an empty schema.
const emptyWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-storage-empty-"));
const emptyResult = prepareRuntimeDatabase({
  runtimePath: path.join(emptyWorkspace, "runtime", "site.db"),
  sharedPath: path.join(emptyWorkspace, "shared", "site.db"),
  sharedDir: path.join(emptyWorkspace, "shared"),
  openDatabase,
  logger: quiet,
});
assert.strictEqual(emptyResult.restoredFrom, null, "the first boot must start empty rather than throw");

/*
 * Anything a person would notice losing gets a snapshot within seconds, not on
 * the ten minute timer. The catalogue does not: it is rebuilt from the feeds
 * every night, so snapshotting on every product write would be constant churn
 * over the network share for nothing.
 */
const hookedWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-hook-"));
const hookedShared = path.join(hookedWorkspace, "shared");
const hooked = new Database(path.join(hookedWorkspace, "site.db"));
hooked.exec(`
  CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT);
  CREATE TABLE saved_offers(id INTEGER PRIMARY KEY, user_id INTEGER, url TEXT);
  CREATE TABLE products(id INTEGER PRIMARY KEY, title TEXT);
`);

const requests = [];
snapshotOnPersonalWrites(hooked, { requestSnapshot: () => requests.push(Date.now()) });

hooked.prepare("INSERT INTO products(title) VALUES (?)").run("a television");
hooked.prepare("UPDATE products SET title = ? WHERE id = 1").run("a better television");
assert.strictEqual(
  requests.length,
  0,
  "A catalogue write asked for a snapshot, which would churn the share for data the nightly refresh rebuilds anyway",
);

hooked.prepare("INSERT INTO users(email) VALUES (?)").run("shopper@example.com");
hooked.prepare("INSERT INTO saved_offers(user_id, url) VALUES (?, ?)").run(1, "https://example.com/p/1");
assert.strictEqual(
  requests.length,
  2,
  "An account or a saved product was written without asking for a snapshot",
);
assert.strictEqual(
  hooked.prepare("SELECT COUNT(*) AS total FROM users").get().total,
  1,
  "Wrapping prepare() broke ordinary reads",
);

/* Signing in writes a user and a session back to back. That is one moment, and
   it should cost one snapshot rather than one per statement. */
const debounced = startSnapshotSchedule(hooked, hookedShared, {
  intervalMs: 60_000,
  personalWriteDelayMs: 30,
  logger: quiet,
});
debounced.requestSnapshot();
debounced.requestSnapshot();
debounced.requestSnapshot();

setTimeout(() => {
  debounced.stop();
  assert.strictEqual(
    listSnapshots(hookedShared).length,
    1,
    "A burst of personal writes produced more than one snapshot",
  );
  hooked.close();

  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(emptyWorkspace, { recursive: true, force: true });
  fs.rmSync(hookedWorkspace, { recursive: true, force: true });

  console.log(
    "Runtime database placement, snapshots, pruning, corrupt-copy fallback and personal-write snapshots passed.",
  );
}, 120);

