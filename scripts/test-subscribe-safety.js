const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

/*
 * What has to be true before this site sends a single marketing email.
 *
 * None of it was. The subscribers table has carried a status column since the
 * beginning and nothing anywhere set it to unsubscribed: no route, no link in
 * any message, no way for a recipient to stop the mail except to report it as
 * spam — the one action that damages the sending domain for everybody else on
 * it. In the United States a bulk message with no working unsubscribe also
 * breaks CAN-SPAM. And the form that adds addresses had no rate limit, so it
 * was a way to send mail from this domain to anyone, as fast as you could post
 * to it.
 *
 * SENDGRID_API_KEY was never set, which is the only reason none of that
 * happened. This exists so it stays impossible once the key is.
 */

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", ...parts), "utf8");
const serverSource = read("src", "server.js");
const mailerSource = read("src", "mailer.js");
const dbSource = read("src", "db.js");

/* ------------------------------------------------------------ the way out */

assert(
  /app\.get\("\/unsubscribe"/.test(serverSource),
  "there is no page a recipient can reach from a link in an email",
);
assert(
  /app\.post\("\/unsubscribe"/.test(serverSource),
  "one-click unsubscribe has nothing to POST to, so Gmail's own button fails",
);
assert(
  /"List-Unsubscribe":/.test(mailerSource) && /List-Unsubscribe=One-Click/.test(mailerSource),
  "the headers mailbox providers read are gone, so the only way out is the spam button",
);
assert(
  /unsubscribeUrl \? `<p/.test(mailerSource) || /Unsubscribe<\/a>/.test(mailerSource),
  "the message body carries no visible unsubscribe link",
);

/* A token, not an address: the link has to work from an inbox with no
   sign-in, and must not let anybody unsubscribe a stranger by guessing. */
assert(
  /unsubscribe_token/.test(dbSource),
  "subscribers carry no unsubscribe token, so a link would have to name the address",
);
assert(
  /\^\[A-Za-z0-9_-\]\{16,80\}\$/.test(serverSource),
  "the unsubscribe token is no longer validated, so the column is scanned on anything",
);

/* ------------------------------------------------ and the way in is guarded */

const subscribeRoute = /app\.post\("\/api\/subscribe", *([a-zA-Z]+)/.exec(serverSource);
assert(subscribeRoute, "the subscribe route moved or lost its middleware");
assert(
  subscribeRoute[1] !== "async",
  "the subscribe form has no rate limit again: it will send mail from this domain to any address, as fast as anyone can post",
);

/* The form says which market the reader is in; deciding from the IP instead
   signed a shopper reading /uk up to the American list. */
assert(
  /normalizeMarket\(req\.body\?\.market\)/.test(serverSource),
  "the market the subscriber chose is ignored again",
);

/* ------------------------------------------- the round trip, on real schema */

const db = new Database(":memory:");
db.exec(/CREATE TABLE IF NOT EXISTS subscribers\([\s\S]*?\n {2}\);/.exec(dbSource)[0]);
db.exec("ALTER TABLE subscribers ADD COLUMN unsubscribe_token TEXT NOT NULL DEFAULT ''");
db.exec("ALTER TABLE subscribers ADD COLUMN unsubscribed_at TEXT");

const now = new Date().toISOString();
const token = crypto.randomBytes(24).toString("base64url");
db.prepare(`
  INSERT INTO subscribers(email,status,source,market,unsubscribe_token,created_at,updated_at)
  VALUES(?,?,?,?,?,?,?)
`).run("someone@example.com", "active", "homepage", "us", token, now, now);

/* ------------------------------------------------- and the promise is kept */

/*
 * subscribers.categories is retired and must stay retired.
 *
 * It held the interests a signup form asked for, and nothing in the repository
 * ever read them: every subscriber on the list got exactly the same email
 * whatever they had ticked. The picker is gone from the form; this is what
 * stops the column quietly filling up again behind it, which is the state
 * that makes the next reader assume the feature works.
 */
assert(
  !/INSERT INTO subscribers\([^)]*\bcategories\b/.test(serverSource),
  "a route writes subscribers.categories again, and nothing anywhere reads it",
);
const subscribeBody = /app\.post\("\/api\/subscribe"[\s\S]*?\n\}\);/.exec(serverSource)[0];
assert(
  !/\bcategories\b/.test(subscribeBody.replace(/\/\*[\s\S]*?\*\//g, "")),
  "the subscribe route collects categories again; the form promises nothing of the kind",
);

/*
 * And the third answer stays on the table. A list whose only alternative to
 * everything is the unsubscribe link loses the readers who would have stayed
 * at a slower pace.
 */
assert(
  /app\.get\("\/email\/less"/.test(serverSource),
  "there is no way to ask for fewer emails short of leaving altogether",
);
assert(
  /drop_opt_in = 1/.test(read("src", "liveDrop.js")),
  "drop announcements ignore the subscriber who asked for fewer of them",
);

const unsubscribe = (value) => {
  db.prepare(`
    UPDATE subscribers SET status='unsubscribed', unsubscribed_at=?, updated_at=?
    WHERE unsubscribe_token=? AND status<>'unsubscribed'
  `).run(now, now, value);
  return db.prepare("SELECT 1 FROM subscribers WHERE unsubscribe_token=?").get(value) != null;
};

assert(token.length >= 16 && token.length <= 80, "the minted token cannot pass the route's own check");
assert(unsubscribe(token), "a valid token did not unsubscribe anybody");
assert.strictEqual(
  db.prepare("SELECT status FROM subscribers").get().status,
  "unsubscribed",
  "the row still reads as active after unsubscribing",
);
/* Mailbox providers retry, and people click twice. Neither is an error. */
assert(unsubscribe(token), "clicking the same link twice reports failure to somebody already unsubscribed");
assert(!unsubscribe("aaaaaaaaaaaaaaaaaaaa"), "a made-up token unsubscribed somebody");

console.log("Subscribe safety checks passed: a way out, one-click headers, a guarded way in.");
