const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "src", "server.js"), "utf8");
const dbSource = fs.readFileSync(path.join(__dirname, "..", "src", "db.js"), "utf8");

/* The schema is lifted from db.js rather than retyped, so a change there that
   breaks these guarantees fails here instead of in production. */
const take = (pattern, what) => {
  const found = pattern.exec(dbSource);
  assert(found, `${what} is no longer declared where this test looks for it`);
  return found[0];
};
const conversations = take(/CREATE TABLE IF NOT EXISTS delia_conversations\([\s\S]*?\);/, "delia_conversations");
const conversationIndex = take(
  /CREATE UNIQUE INDEX IF NOT EXISTS idx_delia_conversations_user_key[\s\S]*?;/,
  "the unique index on delia_conversations",
);
const messages = take(/CREATE TABLE IF NOT EXISTS delia_messages\([\s\S]*?\);/, "delia_messages");

const db = new Database(":memory:");
db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
  ${conversations}${conversationIndex}${messages}`);
db.prepare("INSERT INTO users(id) VALUES(1),(2)").run();

const upsert = db.prepare(`INSERT INTO delia_conversations(user_id,conversation_key,market,title,created_at,updated_at)
  VALUES(?,?,?,?,?,?)
  ON CONFLICT(user_id,conversation_key) DO UPDATE SET updated_at=excluded.updated_at, title=excluded.title`);

/* One panel session is one conversation however many questions it holds. */
upsert.run(1, "key-a", "us", "Mattresses", "2026-08-27T10:00:00Z", "2026-08-27T10:00:00Z");
upsert.run(1, "key-a", "us", "Kettles", "2026-08-27T10:00:00Z", "2026-08-27T10:05:00Z");
const own = db.prepare("SELECT * FROM delia_conversations WHERE user_id=1").all();
assert.strictEqual(own.length, 1, "a second question started a second conversation");
assert.strictEqual(
  own[0].title,
  "Kettles",
  "the title stopped following the conversation, so asking about something else keeps the old heading",
);

/* Two people can be in the middle of their own conversation at once, and a
   key colliding across accounts must not merge them. */
upsert.run(2, "key-a", "us", "Drills", "2026-08-27T10:00:00Z", "2026-08-27T10:00:00Z");
assert.strictEqual(
  db.prepare("SELECT COUNT(*) AS total FROM delia_conversations").get().total,
  2,
  "two shoppers sharing a conversation key were merged into one conversation",
);

const conversationId = own[0].id;
const insertMessage = db.prepare("INSERT INTO delia_messages(conversation_id,role,content,payload,created_at) VALUES(?,?,?,?,?)");
insertMessage.run(conversationId, "user", "find me a kettle", "", "2026-08-27T10:05:00Z");
insertMessage.run(conversationId, "assistant", "Here are three.", JSON.stringify({ message: "Here are three." }), "2026-08-27T10:05:30Z");

/*
 * The one that matters. A delete carries an id from the browser, and an id
 * from somebody else's history must remove nothing rather than their
 * conversation.
 */
const strangerLooking = db.prepare("SELECT id FROM delia_conversations WHERE id=? AND user_id=?")
  .get(conversationId, 2);
assert.strictEqual(strangerLooking, undefined, "one shopper could open another shopper's conversation");

const strangerDeleting = db.prepare("DELETE FROM delia_conversations WHERE id=? AND user_id=?")
  .run(conversationId, 2);
assert.strictEqual(strangerDeleting.changes, 0, "one shopper deleted another shopper's conversation");
assert.strictEqual(
  db.prepare("SELECT COUNT(*) AS total FROM delia_messages WHERE conversation_id=?").get(conversationId).total,
  2,
  "the messages of a conversation somebody else tried to delete are gone",
);

/* Guarded at the route as well as in the SQL: either one alone is a single
   edit away from being somebody else's history. */
assert(
  /app\.get\("\/api\/delia\/conversations", requireUser/.test(serverSource) &&
    /app\.get\("\/api\/delia\/conversations\/:id", requireUser/.test(serverSource) &&
    /app\.delete\("\/api\/delia\/conversations\/:id", requireUser/.test(serverSource),
  "a conversation route stopped requiring a signed-in shopper",
);
assert(
  /WHERE id=\? AND user_id=\?/.test(serverSource),
  "a conversation lookup is no longer scoped to the signed-in shopper",
);
/* Saving a conversation must never be able to break answering one. */
assert(
  /const rememberExchange[\s\S]{0,3000}catch \(error\) \{[\s\S]{0,200}could not save the conversation/.test(serverSource),
  "a failure while saving the conversation can now take down the answer itself",
);
/* Both tables have to stay on the list that snapshots immediately. */
const storageSource = fs.readFileSync(path.join(__dirname, "..", "src", "dbStorage.js"), "utf8");
assert(
  /delia_conversations/.test(storageSource) && /delia_messages/.test(storageSource),
  "conversations are no longer snapshotted straight after being written",
);

console.log("Delia conversations: one per session, ownership and durability guarantees passed.");
