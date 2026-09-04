const assert = require("assert");
const Database = require("better-sqlite3");
const {
  PERSONAL_TABLES,
  readPersonalTables,
  replacePersonalTables,
  _resetForTests,
} = require("../src/personalPostgres");

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT,name TEXT);
  CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at TEXT);
  CREATE TABLE password_reset_tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER,expires_at TEXT,used_at TEXT);
  CREATE TABLE subscribers(id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT,categories TEXT,status TEXT,source TEXT,market TEXT,created_at TEXT,updated_at TEXT);
  CREATE TABLE price_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,product_url TEXT,target_price REAL,created_at TEXT);
  CREATE TABLE saved_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,url TEXT,title TEXT);
  CREATE TABLE delia_conversations(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,conversation_key TEXT);
  CREATE TABLE delia_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id INTEGER,role TEXT);
`);

db.prepare("INSERT INTO users(email,name) VALUES(?,?)").run("person@example.com", "Person");
db.prepare("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run("hash", 1, "tomorrow");
db.prepare("INSERT INTO saved_offers(user_id,url,title) VALUES(?,?,?)").run(1, "https://shop.example/item", "Saved item");
db.prepare("INSERT INTO delia_conversations(user_id,conversation_key) VALUES(?,?)").run(1, "conversation");
db.prepare("INSERT INTO delia_messages(conversation_id,role) VALUES(?,?)").run(1, "user");

const snapshot = readPersonalTables(db);
assert.deepStrictEqual(Object.keys(snapshot), PERSONAL_TABLES);
assert.strictEqual(snapshot.users.length, 1);
assert.strictEqual(snapshot.saved_offers.length, 1);
assert.strictEqual(snapshot.delia_messages.length, 1);

for (const table of [...PERSONAL_TABLES].reverse()) db.prepare(`DELETE FROM ${table}`).run();
assert.strictEqual(db.prepare("SELECT COUNT(*) count FROM users").get().count, 0);

const restored = replacePersonalTables(db, snapshot);
assert.strictEqual(restored, 5);
assert.strictEqual(db.prepare("SELECT email FROM users").get().email, "person@example.com");
assert.strictEqual(db.prepare("SELECT title FROM saved_offers").get().title, "Saved item");
assert.strictEqual(db.prepare("SELECT role FROM delia_messages").get().role, "user");

db.prepare("INSERT INTO users(email,name) VALUES(?,?)").run("second@example.com", "Second");
assert.strictEqual(db.prepare("SELECT id FROM users WHERE email=?").get("second@example.com").id, 2);

db.close();
_resetForTests().then(() => console.log("personal PostgreSQL snapshot tests passed"));
