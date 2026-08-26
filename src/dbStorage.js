const fs = require("fs");
const path = require("path");

/**
 * Keeps the database off Azure's network share.
 *
 * The share under /home is SMB, and SQLite is explicit that it does not
 * survive there. Rollback journalling and synchronous=FULL, which db.js
 * already sets, buy time but do not fix it: production was destroyed twice in
 * one day, both times with the same pair of errors minutes apart, first
 * `disk I/O error` while writing and then `database disk image is malformed`.
 * The second failure took the site down for eight hours.
 *
 * So the live database moves to the container's own disk, where writes behave
 * like writes, and the share goes back to being what it is good at: holding
 * files nobody is writing to concurrently. Snapshots are taken with
 * VACUUM INTO, which produces a complete consistent copy rather than a
 * byte-for-byte image of a file that may be mid-write, and each one is written
 * under a temporary name and renamed into place, so a snapshot interrupted
 * halfway is never mistaken for a good one.
 *
 * The trade is honest and worth naming: the container's disk does not survive
 * the container, so a crash loses whatever was written since the last
 * snapshot. For this catalogue that window costs new clicks and any subscriber
 * who signed up inside it; the products themselves are rebuilt nightly from
 * the feeds regardless. Losing ten minutes of clicks beats losing the day.
 *
 * This assumes a single instance, which is what the plan runs. Scaling out
 * would give each instance its own copy and they would silently diverge, so
 * that has to become a real database first.
 */

const SNAPSHOT_PREFIX = "site-";
const SNAPSHOT_SUFFIX = ".db";
const PARTIAL_SUFFIX = ".partial";

/** Ten minutes: often enough to bound the loss, rare enough to stay cheap. */
const DEFAULT_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_SNAPSHOT_KEEP = 8;

function snapshotDir(sharedDir) {
  return path.join(sharedDir, "backups");
}

/** Newest first. The names are timestamps, so they sort chronologically. */
function listSnapshots(sharedDir) {
  const dir = snapshotDir(sharedDir);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.startsWith(SNAPSHOT_PREFIX) && name.endsWith(SNAPSHOT_SUFFIX))
    .sort()
    .reverse()
    .map((name) => path.join(dir, name));
}

function modifiedAt(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Does this file open and pass an integrity check?
 *
 * Restoring a corrupt snapshot would only move the outage forward by one
 * restart, so every candidate is opened read-only and checked before it is
 * trusted. `openDatabase` is injected so the check runs against the same
 * driver the application uses.
 */
function isHealthyDatabase(file, openDatabase) {
  if (!file || !fs.existsSync(file) || modifiedAt(file) === 0) return false;
  let probe = null;
  try {
    probe = openDatabase(file, { readonly: true, fileMustExist: true });
    const rows = probe.pragma("integrity_check(1)");
    const verdict = String(Object.values(rows?.[0] || {})[0] || "").toLowerCase();
    return verdict === "ok";
  } catch {
    return false;
  } finally {
    try {
      probe?.close();
    } catch {}
  }
}

/**
 * The newest copy that is actually usable.
 *
 * Order is by age rather than by location: a snapshot taken ten minutes ago
 * beats the file left on the share by the previous architecture, and the
 * runtime copy beats both when the app restarted without the container being
 * recycled.
 */
function bestAvailableCopy({ runtimePath, sharedPath, sharedDir, openDatabase }) {
  const candidates = [runtimePath, ...listSnapshots(sharedDir), sharedPath]
    .filter(Boolean)
    .filter((file, index, all) => all.indexOf(file) === index)
    .filter((file) => fs.existsSync(file))
    .sort((left, right) => modifiedAt(right) - modifiedAt(left));
  return candidates.find((file) => isHealthyDatabase(file, openDatabase)) || null;
}

/**
 * Puts a usable database on local disk and reports where it came from.
 *
 * Returns `{ restoredFrom }`, null when the runtime copy was already good and
 * needed no restore, so the caller can say plainly in the logs whether this
 * boot started from the container's own copy or fell back to the share.
 */
function prepareRuntimeDatabase({ runtimePath, sharedPath, sharedDir, openDatabase, logger = console }) {
  fs.mkdirSync(path.dirname(runtimePath), { recursive: true });

  if (isHealthyDatabase(runtimePath, openDatabase)) return { restoredFrom: null };

  const source = bestAvailableCopy({ runtimePath, sharedPath, sharedDir, openDatabase });
  if (!source) {
    /* Nothing to restore is normal exactly once, on the very first boot: the
       schema below creates an empty database. It is alarming every other
       time, so say so rather than starting silently. */
    logger.warn(
      `[db] no healthy database found to restore; starting empty at ${runtimePath}`,
    );
    return { restoredFrom: null };
  }
  if (source === runtimePath) return { restoredFrom: null };

  fs.copyFileSync(source, runtimePath);
  /* A journal left beside the old file describes byte offsets in that file,
     not in this copy, so carrying it over would corrupt the restore. */
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    fs.rmSync(`${runtimePath}${suffix}`, { force: true });
  }
  logger.warn(`[db] restored ${path.basename(source)} to ${runtimePath}`);
  return { restoredFrom: source };
}

function pruneSnapshots(sharedDir, keep, logger = console) {
  const stale = listSnapshots(sharedDir).slice(Math.max(1, keep));
  for (const file of stale) {
    try {
      fs.rmSync(file, { force: true });
    } catch (error) {
      logger.warn(`[db] could not remove old snapshot ${path.basename(file)}: ${error.message}`);
    }
  }
}

function snapshotName(now = new Date()) {
  return `${SNAPSHOT_PREFIX}${now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}Z${SNAPSHOT_SUFFIX}`;
}

/**
 * Writes one snapshot to the share and returns its path.
 *
 * VACUUM INTO refuses to run inside a transaction, which is the behaviour we
 * want: a snapshot is either taken against a settled database or not taken.
 */
function writeSnapshot(db, sharedDir, { keep = DEFAULT_SNAPSHOT_KEEP, logger = console, now } = {}) {
  const dir = snapshotDir(sharedDir);
  fs.mkdirSync(dir, { recursive: true });

  const target = path.join(dir, snapshotName(now));
  const partial = `${target}${PARTIAL_SUFFIX}`;
  fs.rmSync(partial, { force: true });

  db.exec(`VACUUM INTO '${partial.replaceAll("'", "''")}'`);
  fs.renameSync(partial, target);

  pruneSnapshots(sharedDir, keep, logger);
  return target;
}

/**
 * Snapshots on a timer for as long as the process lives.
 *
 * A failed snapshot is logged and otherwise ignored: the share being briefly
 * unavailable is exactly the condition this design exists to tolerate, and
 * taking the site down over it would defeat the point. `unref` keeps the timer
 * from holding the process open on shutdown.
 */
function startSnapshotSchedule(
  db,
  sharedDir,
  { intervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS, keep = DEFAULT_SNAPSHOT_KEEP, logger = console } = {},
) {
  const take = (reason) => {
    try {
      const file = writeSnapshot(db, sharedDir, { keep, logger });
      logger.log(`[db] snapshot ${path.basename(file)} (${reason})`);
      return file;
    } catch (error) {
      logger.warn(`[db] snapshot failed (${reason}): ${error.message}`);
      return null;
    }
  };

  const timer = setInterval(() => take("scheduled"), intervalMs);
  timer.unref?.();

  /* Best effort only. Azure allows a few seconds to shut down and copying to
     the share can outlast that, which is precisely why the timer above, and
     not this, is the guarantee. */
  const onExit = () => take("shutdown");
  process.once("SIGTERM", onExit);
  process.once("SIGINT", onExit);

  return { snapshotNow: (reason = "manual") => take(reason), stop: () => clearInterval(timer) };
}

module.exports = {
  DEFAULT_SNAPSHOT_INTERVAL_MS,
  DEFAULT_SNAPSHOT_KEEP,
  bestAvailableCopy,
  isHealthyDatabase,
  listSnapshots,
  prepareRuntimeDatabase,
  pruneSnapshots,
  snapshotDir,
  snapshotName,
  startSnapshotSchedule,
  writeSnapshot,
};
