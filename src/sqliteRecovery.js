const fs = require("fs");
const path = require("path");

function isCorruptionError(error) {
  return /SQLITE_CORRUPT|database disk image is malformed/i.test(String(error?.code || error?.message || error));
}

function integrityProblems(db, limit = 10) {
  try {
    const pragmaResult = db.pragma(`integrity_check(${limit})`);
    // better-sqlite3 returns the PRAGMA rows directly. The node:sqlite-backed
    // adapter used by integration tests executes pragma() without returning
    // rows, so read them through a prepared PRAGMA in that case.
    const rows = Array.isArray(pragmaResult)
      ? pragmaResult
      : db.prepare(`PRAGMA integrity_check(${limit})`).all();

    return rows
      .map((row) => String(Object.values(row)[0] || ""))
      .filter((message) => message.toLowerCase() !== "ok");
  } catch (error) {
    if (!isCorruptionError(error)) throw error;
    return [String(error.message || error)];
  }
}

function backupPathFor(dbPath) {
  return /\.db$/i.test(dbPath)
    ? dbPath.replace(/\.db$/i, ".pre-reindex-backup.db")
    : `${dbPath}.pre-reindex-backup`;
}

function preserveDatabaseFiles(dbPath) {
  const backupPath = backupPathFor(dbPath);
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${dbPath}${suffix}`;
    const destination = `${backupPath}${suffix}`;
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  }
  return backupPath;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function rebuildUserIndexes(db) {
  const indexes = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name")
    .all()
    .filter((index) => index.name && index.sql);

  db.exec("BEGIN IMMEDIATE");
  try {
    for (const index of indexes) db.exec(`DROP INDEX ${quoteIdentifier(index.name)}`);
    for (const index of indexes) db.exec(index.sql);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }

  return indexes.map((index) => index.name);
}

function repairIndexesIfNeeded(db, dbPath, { enabled = false, logger = console } = {}) {
  if (!enabled || !fs.existsSync(dbPath)) return { repaired: false, problems: [] };

  const problems = integrityProblems(db);
  if (problems.length === 0) return { repaired: false, problems: [] };

  const backupPath = preserveDatabaseFiles(dbPath);
  logger.warn(
    `[db] SQLite integrity check failed; preserving ${path.basename(backupPath)} and rebuilding indexes`,
  );

  let reindexFailed = false;
  try {
    db.exec("REINDEX");
  } catch (error) {
    if (!isCorruptionError(error)) throw error;
    reindexFailed = true;
  }

  let remaining = integrityProblems(db);
  if (reindexFailed || remaining.length > 0) {
    logger.warn("[db] REINDEX could not clear the corruption; recreating user indexes from schema");
    rebuildUserIndexes(db);
    remaining = integrityProblems(db);
  }
  if (remaining.length > 0) {
    throw new Error(`SQLite remains corrupt after index rebuild: ${remaining.slice(0, 3).join("; ")}`);
  }

  logger.warn("[db] SQLite index repair completed and integrity_check returned ok");
  return { repaired: true, problems, backupPath };
}

module.exports = {
  backupPathFor,
  integrityProblems,
  isCorruptionError,
  rebuildUserIndexes,
  repairIndexesIfNeeded,
};
