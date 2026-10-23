/*
 * The first week's three letters: what is owed, when, and never twice.
 *
 * Built on the real schema from src/db.js, the way test-weekly-digest.js is.
 *
 * The failure this file exists to prevent is the sweep that runs every minute
 * finding a list of people who all joined a month ago and sending every one of
 * them the whole sequence at once. Three emails in a minute, from a sender
 * they have heard from twice, is the fastest way to turn a list into spam
 * reports — and it is the obvious shape of the naive implementation.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { DatabaseSync } = require("node:sqlite");

class TestDatabase {
  constructor(filename) { this.database = new DatabaseSync(filename); }
  pragma(value) { this.database.exec(`PRAGMA ${value}`); }
  exec(sql) { return this.database.exec(sql); }
  prepare(sql) {
    const statement = this.database.prepare(sql);
    return {
      all: (...params) => statement.all(...params),
      get: (...params) => statement.get(...params),
      run: (...params) => statement.run(...params),
    };
  }
  transaction(callback) {
    return (...args) => {
      this.database.exec("BEGIN");
      try {
        const result = callback(...args);
        this.database.exec("COMMIT");
        return result;
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    };
  }
}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "better-sqlite3") return TestDatabase;
  return originalLoad.call(this, request, parent, isMain);
};

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onedailydrop-welcome-"));
process.env.SUPPORTED_MARKETS = "us";

const db = require("../src/db");
const { WELCOME_STEPS, nextStepFor, sendWelcomeSequence } = require("../src/welcomeSequence");

const DAY = 24 * 3600 * 1000;
const now = Date.parse("2026-10-20T12:00:00Z");
const iso = (value) => new Date(value).toISOString();

/* ------------------------------------------------------------ the schedule */

assert.deepStrictEqual(
  WELCOME_STEPS.map((step) => step.key),
  ["intro", "score", "digest_invite"],
  "the order of the first week changed; it is the schedule, not a list",
);

/* Nothing is owed on the day somebody joins. The confirmation has just
   arrived and a second letter an hour later is a sender with no self-control. */
assert.strictEqual(nextStepFor({ createdAt: iso(now), now }), null, "a letter was due on the day of signing up");
assert.strictEqual(
  nextStepFor({ createdAt: iso(now - 20 * 3600 * 1000), now })?.key,
  undefined,
  "the first letter went out before its day had arrived",
);
assert.strictEqual(nextStepFor({ createdAt: iso(now - 1 * DAY), now }).key, "intro");
assert.strictEqual(
  nextStepFor({ createdAt: iso(now - 3 * DAY), sent: new Set(["intro"]), now }).key,
  "score",
);
assert.strictEqual(
  nextStepFor({ createdAt: iso(now - 7 * DAY), sent: new Set(["intro", "score"]), now }).key,
  "digest_invite",
);
assert.strictEqual(
  nextStepFor({ createdAt: iso(now - 40 * DAY), sent: new Set(["intro", "score", "digest_invite"]), now }),
  null,
  "a fourth letter was invented for somebody who has had all three",
);

/*
 * The days are counted from the subscription, not from the previous letter.
 *
 * Somebody who joined forty days ago and has had the first letter is owed the
 * second now — not three days after whenever the first one happened to go.
 * Otherwise a sweep that was down for a week pushes every reader back a week.
 */
assert.strictEqual(
  nextStepFor({ createdAt: iso(now - 40 * DAY), sent: new Set(["intro"]), now }).key,
  "score",
  "the schedule restarted from the last letter instead of from the subscription",
);

/* ------------------------------------------------------------- the sending */

const addSubscriber = ({ email, token, joinedDaysAgo, status = "active" }) => {
  db.prepare(
    `INSERT INTO subscribers(email,categories,status,source,market,unsubscribe_token,
       digest_opt_in,created_at,updated_at)
     VALUES(?,'[]',?,'homepage','us',?,0,?,?)`,
  ).run(email, status, token, iso(now - joinedDaysAgo * DAY), iso(now));
  return db.prepare("SELECT id FROM subscribers WHERE email = ?").get(email).id;
};

const product = {
  id: 1,
  title: "A listing",
  href: "https://www.onedailydrop.com/us/deal/1",
  price: "$20.79",
  imageUrl: "https://i.ebayimg.com/images/g/abc/s-l300.jpg",
  category: "Electronics",
  reasons: ["20% below the highest daily price we recorded", "4.9/5 from 8 reviews", "Score 91/100"],
  score: 91,
};

function senders(log) {
  return {
    intro: async (message) => log.push({ step: "intro", ...message }),
    score: async (message) => log.push({ step: "score", ...message }),
    digest_invite: async (message) => log.push({ step: "digest_invite", ...message }),
  };
}

const run = (log, options = {}) => sendWelcomeSequence({
  db,
  senders: senders(log),
  featuredFor: () => product,
  joinUrlFor: (subscriber) => `https://example.test/digest/join?token=${subscriber.unsubscribe_token}`,
  unsubscribeUrlFor: (subscriber) => `https://example.test/unsubscribe?token=${subscriber.unsubscribe_token}`,
  now,
  ...options,
});

async function main() {
  const veteran = addSubscriber({ email: "veteran@example.test", token: "token_veteran_0123456789", joinedDaysAgo: 40 });
  addSubscriber({ email: "yesterday@example.test", token: "token_yesterday_012345678", joinedDaysAgo: 1 });
  addSubscriber({ email: "today@example.test", token: "token_today_0123456789abc", joinedDaysAgo: 0 });
  addSubscriber({ email: "left@example.test", token: "token_left_0123456789abcd", joinedDaysAgo: 40, status: "unsubscribed" });
  const slower = addSubscriber({ email: "sunday-only@example.test", token: "token_slow_0123456789abcd", joinedDaysAgo: 3 });
  db.prepare("UPDATE subscribers SET drop_opt_in=0, digest_opt_in=1 WHERE id=?").run(slower);

  /* -------------------------------------------- one letter per sweep, in order */

  const first = [];
  assert.deepStrictEqual(await run(first), { intro: 2 }, "the first sweep did not send exactly the intro letters");
  assert.deepStrictEqual(
    first.map((message) => message.email).sort(),
    ["veteran@example.test", "yesterday@example.test"],
    "somebody who joined today, left, or chose Sunday-only mail was written to",
  );
  assert.ok(
    !first.some((message) => message.email === "left@example.test"),
    "an address that unsubscribed was sent a welcome letter",
  );

  /*
   * The whole point. The sweep runs every minute; a reader who joined forty
   * days ago is owed all three letters, and must not get them in one minute.
   *
   * Only the veteran moves on. The reader who joined yesterday has had the
   * first letter and is not owed the second until day three — the schedule is
   * the subscription's age, not how recently we wrote to them.
   */
  const second = [];
  assert.deepStrictEqual(await run(second), { score: 1 }, "the second sweep skipped a step or repeated one");
  assert.strictEqual(
    second[0].email,
    "veteran@example.test",
    "a reader one day old was sent the day-three letter",
  );
  assert.strictEqual(second[0].product.score, 91, "the day-three letter went out with no listing to explain");

  const third = [];
  assert.deepStrictEqual(await run(third), { digest_invite: 1 }, "the invitation did not follow the explainer");
  assert.ok(
    third[0].joinUrl.includes("digest/join"),
    "the invitation carried no way to accept it",
  );
  assert.ok(
    third.every((message) => message.unsubscribeUrl.includes("unsubscribe")),
    "a letter went out with no way off the list",
  );

  /* And then nothing, ever again. */
  const fourth = [];
  assert.deepStrictEqual(await run(fourth), {}, "a fourth letter was sent to somebody who had all three");

  /* --------------------------------------- never twice, whatever happens */

  /*
   * A restart, or two sweeps overlapping, must not re-send. The record is
   * written before the message, so the second attempt finds the row and stops.
   */
  db.prepare("DELETE FROM subscriber_sequence WHERE subscriber_id = ? AND step = 'intro'").run(veteran);
  const repeat = [];
  await run(repeat);
  assert.deepStrictEqual(
    repeat.map((message) => message.step),
    ["intro"],
    "clearing one record did not make exactly that one letter owed again",
  );

  /* ------------------------------------------ nothing to show, nothing sent */

  const quiet = addSubscriber({ email: "quiet@example.test", token: "token_quiet_0123456789abc", joinedDaysAgo: 5 });
  await run([], {});
  db.prepare("DELETE FROM subscriber_sequence WHERE subscriber_id = ?").run(quiet);
  db.prepare("INSERT INTO subscriber_sequence(subscriber_id,step,sent_at) VALUES(?,'intro',?)")
    .run(quiet, iso(now));
  const empty = [];
  await sendWelcomeSequence({
    db,
    senders: senders(empty),
    featuredFor: () => null,
    now,
  });
  assert.ok(
    !empty.some((message) => message.step === "score"),
    "the day-three letter went out with an empty card because nothing cleared the floor",
  );
  assert.strictEqual(
    db.prepare("SELECT COUNT(*) AS n FROM subscriber_sequence WHERE subscriber_id = ? AND step = 'score'")
      .get(quiet).n,
    0,
    "a letter that was never sent was recorded as sent, so it will never go",
  );

  /*
   * An unsendable day-three letter must not take the invitation with it.
   *
   * The check above uses somebody five days old, so the day-three letter is
   * the only one owed and there is nothing behind it to hold back. This is
   * the case that actually cost something: presentProduct never produced
   * deal_url, so the day-three letter could never be built, and because the
   * sweep offered only the first owed step it stood in front of the day-seven
   * invitation for ever. That invitation is the one link to the Sunday list,
   * so a missing card did not skip a letter — it closed the list.
   */
  const stuck = addSubscriber({
    email: "stuck@example.test",
    token: "token_stuck_0123456789abc",
    joinedDaysAgo: 10,
  });
  db.prepare("DELETE FROM subscriber_sequence WHERE subscriber_id = ?").run(stuck);
  db.prepare("INSERT INTO subscriber_sequence(subscriber_id,step,sent_at) VALUES(?,'intro',?)")
    .run(stuck, iso(now));

  const blocked = [];
  await sendWelcomeSequence({
    db,
    senders: senders(blocked),
    featuredFor: () => null,
    joinUrlFor: (subscriber) => `https://example.test/digest/join?token=${subscriber.unsubscribe_token}`,
    now,
  });
  const toStuck = blocked.filter((message) => message.email === "stuck@example.test");
  assert.deepStrictEqual(
    toStuck.map((message) => message.step),
    ["digest_invite"],
    "the day-seven invitation was held back by a day-three letter that could not be built",
  );
  assert.ok(
    toStuck[0] && toStuck[0].joinUrl,
    "the invitation went out with no link to join the Sunday list",
  );

  /* The skipped letter keeps its place: unrecorded, so it is still owed and
     still tried first once there is something to put in it. */
  assert.strictEqual(
    db.prepare("SELECT COUNT(*) AS n FROM subscriber_sequence WHERE subscriber_id = ? AND step = 'score'")
      .get(stuck).n,
    0,
    "the day-three letter was marked sent although it never went, so it can never be sent later",
  );

  /* Still one letter per subscriber per sweep: stepping over a letter is not
     a licence to send the rest of the sequence inside a minute. */
  assert.strictEqual(toStuck.length, 1, "more than one letter went to the same subscriber in one sweep");

  console.log("Welcome sequence checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
