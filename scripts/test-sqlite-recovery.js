const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const {
  backupPathFor,
  integrityProblems,
  repairIndexesIfNeeded,
} = require("../src/sqliteRecovery");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-sqlite-repair-"));
const dbPath = path.join(directory, "site.db");
let db = new Database(dbPath);
db.pragma("journal_mode = DELETE");
db.exec("CREATE TABLE products(id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
db.exec("CREATE INDEX idx_products_title ON products(title)");

const insert = db.prepare("INSERT INTO products(title) VALUES (?)");
db.transaction(() => {
  for (let index = 0; index < 50; index += 1) insert.run(`Product ${String(index).padStart(5, "0")}`);
})();

const pageSize = db.pragma("page_size", { simple: true });
const indexRootPage = db
  .prepare("SELECT rootpage FROM sqlite_master WHERE type='index' AND name='idx_products_title'")
  .get().rootpage;
db.close();

const descriptor = fs.openSync(dbPath, "r+");
const page = Buffer.alloc(pageSize);
fs.readSync(descriptor, page, 0, pageSize, (indexRootPage - 1) * pageSize);
assert.strictEqual(page[0], 0x0a, "The test index no longer fits on one leaf page");

function readVarint(buffer, offset) {
  let value = 0;
  let length = 0;
  while (length < 9) {
    const byte = buffer[offset + length];
    value = (value * 128) + (byte & 0x7f);
    length += 1;
    if ((byte & 0x80) === 0) break;
  }
  return { value, length };
}

const firstCell = page.readUInt16BE(8);
const payloadSize = readVarint(page, firstCell);
const payloadStart = firstCell + payloadSize.length;
const recordHeaderSize = readVarint(page, payloadStart).value;
const titleByte = payloadStart + recordHeaderSize + 4;
page[titleByte] ^= 0x01;
fs.writeSync(descriptor, page, 0, pageSize, (indexRootPage - 1) * pageSize);
fs.closeSync(descriptor);

db = new Database(dbPath);
assert(integrityProblems(db).length > 0, "The fixture did not create detectable index corruption");
const messages = [];
const result = repairIndexesIfNeeded(db, dbPath, {
  enabled: true,
  logger: { warn: (message) => messages.push(message) },
});

assert.strictEqual(result.repaired, true);
assert.strictEqual(integrityProblems(db).length, 0, "REINDEX did not restore SQLite integrity");
assert.strictEqual(
  db.prepare("SELECT id FROM products WHERE title=?").get("Product 00034").id,
  35,
  "Index repair lost table data",
);
assert(fs.existsSync(backupPathFor(dbPath)), "The damaged database was not backed up before repair");
assert(messages.some((message) => message.includes("integrity_check returned ok")));
db.close();
fs.rmSync(directory, { recursive: true, force: true });

console.log("SQLite corruption backup and index recovery passed.");
