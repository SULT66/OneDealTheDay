const fs = require("fs");
const path = require("path");

function isCorruptionError(error) {
  return /SQLITE_CORRUPT|database disk image is malformed/i.test(String(error?.code || error?.message || error));
}

function integrityProblems(db, limit = 10) {
  try {
    return db
      .pragma(`integrity_check(${limit})`)
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

function repairIndexesIfNeeded(db, dbPath, { enabled = false, logger = console } = {}) {
  if (!enabled || !fs.existsSync(dbPath)) return { repaired: false, problems: [] };

  const problems = integrityProblems(db);
  if (problems.length === 0) return { repaired: false, problems: [] };

  const backupPath = preserveDatabaseFiles(dbPath);
  logger.warn(
    `[db] SQLite integrity check failed; preserving ${path.basename(backupPath)} and rebuilding indexes`,
  );

  db.exec("REINDEX");
  const remaining = integrityProblems(db);
  if (remaining.length > 0) {
    throw new Error(`SQLite remains corrupt after REINDEX: ${remaining.slice(0, 3).join("; ")}`);
  }

  logger.warn("[db] SQLite index repair completed and integrity_check returned ok");
  return { repaired: true, problems, backupPath };
}

module.exports = {
  backupPathFor,
  integrityProblems,
  isCorruptionError,
  repairIndexesIfNeeded,
};
