const postgres = require("postgres");

/*
 * The catalogue remains SQLite-backed because it is rebuilt from retailer
 * feeds and hundreds of synchronous ranking queries depend on that API. These
 * tables hold data a person created and cannot be rebuilt after a lost
 * container, so PostgreSQL keeps their authoritative whole-table snapshots.
 */
const PERSONAL_TABLES = [
  "users",
  "user_sessions",
  "password_reset_tokens",
  "subscribers",
  "price_alerts",
  "saved_offers",
  "delia_conversations",
  "delia_messages",
];

const DELETE_ORDER = [...PERSONAL_TABLES].reverse();
const PERSONAL_WRITE = new RegExp(`\\b(?:${PERSONAL_TABLES.join("|")})\\b`, "i");
const WRITE_STATEMENT = /^\s*(?:insert|update|delete|replace)\b/i;

let client = null;
let mirrorTimer = null;
let mirrorChain = Promise.resolve();
let runtimeDb = null;
let runtimeLogger = console;
let writeHookInstalled = false;
let state = {
  enabled: false,
  connected: false,
  rows: 0,
  tables: 0,
  lastMirroredAt: null,
  lastRestoredAt: null,
  error: null,
};

function databaseUrl() {
  return String(process.env.ONEDAILYDROP_DATABASE_URL || "").trim();
}

function enabled() {
  return Boolean(databaseUrl());
}

function sqlClient() {
  if (!client) {
    client = postgres(databaseUrl(), {
      max: Number(process.env.ONEDAILYDROP_DATABASE_POOL_SIZE || 3),
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
    });
  }
  return client;
}

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}

function readPersonalTables(db) {
  const snapshot = {};
  for (const table of PERSONAL_TABLES) {
    if (tableExists(db, table)) snapshot[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return snapshot;
}

function replacePersonalTables(db, snapshot) {
  const available = new Set(
    PERSONAL_TABLES.filter((table) => Array.isArray(snapshot?.[table]) && tableExists(db, table)),
  );
  if (!available.size) return 0;

  let restored = 0;
  db.transaction(() => {
    for (const table of DELETE_ORDER) {
      if (available.has(table)) db.prepare(`DELETE FROM ${table}`).run();
    }
    for (const table of PERSONAL_TABLES) {
      if (!available.has(table)) continue;
      for (const row of snapshot[table]) {
        const columns = Object.keys(row);
        if (!columns.length) continue;
        const names = columns.map((column) => `"${column.replaceAll('"', '""')}"`).join(",");
        const values = columns.map(() => "?").join(",");
        db.prepare(`INSERT INTO ${table} (${names}) VALUES (${values})`)
          .run(...columns.map((column) => row[column]));
        restored += 1;
      }
    }
    if (tableExists(db, "sqlite_sequence")) {
      for (const table of PERSONAL_TABLES) {
        if (!available.has(table)) continue;
        const hasId = db.prepare(`PRAGMA table_info(${table})`).all().some((column) => column.name === "id");
        if (!hasId) continue;
        const maximum = Number(db.prepare(`SELECT COALESCE(MAX(id),0) value FROM ${table}`).get().value || 0);
        db.prepare("DELETE FROM sqlite_sequence WHERE name=?").run(table);
        if (maximum) db.prepare("INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)").run(table, maximum);
      }
    }
  })();
  return restored;
}

async function ensureSchema(sql = sqlClient()) {
  await sql`
    CREATE TABLE IF NOT EXISTS odd_personal_snapshots (
      table_name TEXT PRIMARY KEY,
      rows JSONB NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

async function writeSnapshot(db, reason = "write") {
  if (!enabled()) return { rows: 0, tables: 0 };
  const snapshot = readPersonalTables(db);
  const sql = sqlClient();
  await ensureSchema(sql);
  await sql.begin(async (tx) => {
    for (const [table, rows] of Object.entries(snapshot)) {
      await tx`
        INSERT INTO odd_personal_snapshots (table_name, rows, captured_at)
        VALUES (${table}, ${tx.json(rows)}, NOW())
        ON CONFLICT (table_name)
        DO UPDATE SET rows = EXCLUDED.rows, captured_at = NOW()
      `;
    }
  });
  const rows = Object.values(snapshot).reduce((total, entries) => total + entries.length, 0);
  state = {
    ...state,
    enabled: true,
    connected: true,
    rows,
    tables: Object.keys(snapshot).length,
    lastMirroredAt: new Date().toISOString(),
    error: null,
  };
  runtimeLogger.log(`[personal-postgres] mirrored ${rows} rows in ${state.tables} tables (${reason})`);
  return { rows, tables: state.tables };
}

async function readSnapshot() {
  const sql = sqlClient();
  await ensureSchema(sql);
  const rows = await sql`
    SELECT table_name, rows
    FROM odd_personal_snapshots
    ORDER BY table_name
  `;
  return Object.fromEntries(rows.map((row) => [row.table_name, row.rows]));
}

function queueMirror(reason = "write", delayMs = 250) {
  if (!runtimeDb || !enabled()) return;
  if (mirrorTimer) clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(() => {
    mirrorTimer = null;
    mirrorChain = mirrorChain
      .then(() => writeSnapshot(runtimeDb, reason))
      .catch((error) => {
        state = { ...state, connected: false, error: error.message };
        runtimeLogger.error(`[personal-postgres] mirror failed: ${error.message}`);
      });
  }, delayMs);
}

function installWriteHook(db) {
  if (writeHookInstalled) return;
  const prepare = db.prepare.bind(db);
  db.prepare = (statement) => {
    const prepared = prepare(statement);
    if (!WRITE_STATEMENT.test(statement) || !PERSONAL_WRITE.test(statement)) return prepared;
    const run = prepared.run.bind(prepared);
    prepared.run = (...args) => {
      const result = run(...args);
      queueMirror("personal write");
      return result;
    };
    return prepared;
  };
  writeHookInstalled = true;
}

async function bootstrapPersonalPostgres(db, { logger = console } = {}) {
  runtimeDb = db;
  runtimeLogger = logger;
  state = { ...state, enabled: enabled() };
  if (!enabled()) return health();

  try {
    const migrate = String(process.env.ONEDAILYDROP_MIGRATE_SQLITE_ON_STARTUP || "") === "1";
    const snapshot = await readSnapshot();
    if (migrate || !Object.keys(snapshot).length) {
      await writeSnapshot(db, migrate ? "initial migration" : "initial seed");
    } else {
      const restored = replacePersonalTables(db, snapshot);
      state = {
        ...state,
        connected: true,
        rows: restored,
        tables: Object.keys(snapshot).length,
        lastRestoredAt: new Date().toISOString(),
        error: null,
      };
      logger.log(`[personal-postgres] restored ${restored} rows from PostgreSQL`);
    }
    installWriteHook(db);
  } catch (error) {
    state = { ...state, connected: false, error: error.message };
    logger.error(`[personal-postgres] startup failed; continuing on SQLite: ${error.message}`);
  }
  return health();
}

function health() {
  return {
    ...state,
    error: state.error ? "unavailable" : null,
  };
}

module.exports = {
  PERSONAL_TABLES,
  bootstrapPersonalPostgres,
  health,
  readPersonalTables,
  replacePersonalTables,
  writeSnapshot,
  _resetForTests: async () => {
    if (mirrorTimer) clearTimeout(mirrorTimer);
    mirrorTimer = null;
    mirrorChain = Promise.resolve();
    runtimeDb = null;
    writeHookInstalled = false;
    if (client) await client.end({ timeout: 0 });
    client = null;
    state = {
      enabled: false,
      connected: false,
      rows: 0,
      tables: 0,
      lastMirroredAt: null,
      lastRestoredAt: null,
      error: null,
    };
  },
};
